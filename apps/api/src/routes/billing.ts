import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ObjectId } from "mongodb";
import type Stripe from "stripe";
import { getStripe, requireStripeWebhookSecret } from "../stripe.js";
import rawBody from "fastify-raw-body";
import { getUsersCollection } from "../users.js";
import { fail, ok } from "../response.js";
import {
  BillingInfo,
  billingFromSubscription,
  defaultBilling,
  normalizeBilling,
  priceIdByPlan,
  serializeBilling,
} from "../billing.js";
import { writeAuditLog } from "../audit.js";
import { config } from "../config.js";
import { getCollection } from "../db.js";
import { env } from "../env.js";
import { getSellerEntitlements } from "../entitlements.js";

type StripeWebhookEventRecord = {
  stripe_event_id: string;
  stripe_event_type: string;
  received_at: Date;
  processed_at?: Date;
  status: "received" | "processed" | "duplicate" | "failed";
  user_id?: string;
  error_message?: string;
};

type StripeWebhookEventsCollection = {
  insertOne: (doc: StripeWebhookEventRecord) => Promise<unknown>;
  updateOne: (
    query: { stripe_event_id: string },
    update: { $set: Partial<StripeWebhookEventRecord> }
  ) => Promise<unknown>;
};

let stripeWebhookEventsCollectionPromise:
  | Promise<StripeWebhookEventsCollection>
  | null = null;
const inMemoryStripeWebhookEvents = new Map<string, StripeWebhookEventRecord>();

const getStripeWebhookEventsCollection = async (): Promise<StripeWebhookEventsCollection> => {
  if (!stripeWebhookEventsCollectionPromise) {
    stripeWebhookEventsCollectionPromise = (async () => {
      try {
        const collection = getCollection<StripeWebhookEventRecord>(
          "stripe_webhook_events"
        );
        await collection.createIndex({ stripe_event_id: 1 }, { unique: true });
        return collection;
      } catch (error) {
        if (false) {
          throw error;
        }
        return {
          insertOne: async (doc) => {
            if (inMemoryStripeWebhookEvents.has(doc.stripe_event_id)) {
              const duplicateError = new Error("E11000 duplicate key error");
              (duplicateError as { code?: number }).code = 11000;
              throw duplicateError;
            }
            inMemoryStripeWebhookEvents.set(doc.stripe_event_id, doc);
          },
          updateOne: async (query, update) => {
            const existing = inMemoryStripeWebhookEvents.get(query.stripe_event_id);
            if (!existing) return;
            inMemoryStripeWebhookEvents.set(query.stripe_event_id, {
              ...existing,
              ...update.$set,
            });
          },
        } satisfies StripeWebhookEventsCollection;
      }
    })();
  }
  return stripeWebhookEventsCollectionPromise!;
};

const isDuplicateKeyError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: number; message?: string };
  return maybeError.code === 11000 || maybeError.message?.includes("E11000") === true;
};

const createCheckoutSchema = z.object({
  plan: z.enum(["pro", "enterprise"]),
});

const shouldUseStripeCheckout = ({
  role,
  plan,
}: {
  role: string | null | undefined;
  plan: "pro" | "enterprise";
}) => {
  if (role === "seller") {
    return plan === "enterprise";
  }
  if (role === "buyer") {
    return plan === "pro" || plan === "enterprise";
  }
  return false;
};

const normalizeHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const resolveOrigin = (request: FastifyRequest) => {
  const origin = normalizeHeader(request.headers.origin);
  if (origin) return origin;
  const host = normalizeHeader(request.headers.host);
  if (host && request.protocol) {
    return `${request.protocol}://${host}`;
  }
  return undefined;
};

const resolveUserIdFromEvent = async (event: Stripe.Event) => {
  const dataObject = event.data.object as
    | Stripe.Checkout.Session
    | Stripe.Subscription
    | Stripe.Invoice
    | Stripe.Customer
    | undefined;
  const metadataUserId =
    dataObject && "metadata" in dataObject ? dataObject.metadata?.user_id : undefined;
  if (metadataUserId && ObjectId.isValid(metadataUserId)) {
    return metadataUserId;
  }

  const customerId =
    dataObject && "customer" in dataObject
      ? typeof dataObject.customer === "string"
        ? dataObject.customer
        : dataObject.customer?.id
      : undefined;
  if (!customerId) return undefined;

  const users = getUsersCollection();
  const user = await users.findOne({ "billing.stripe_customer_id": customerId });
  return user ? user._id.toHexString() : undefined;
};

const updateUserBilling = async ({
  userId,
  nextBilling,
  eventId,
  eventType,
}: {
  userId: ObjectId;
  nextBilling: BillingInfo;
  eventId?: string;
  eventType?: string;
}) => {
  const col = getUsersCollection();
  const user = await col.findOne({ _id: userId });
  if (!user) return;

  const previous = normalizeBilling(user.billing);
  await col.updateOne(
    { _id: userId },
    {
      $set: {
        billing: nextBilling,
        updatedAt: new Date(),
      },
    }
  );

  await writeAuditLog("billing_status_changed", {
    user_id: userId.toHexString(),
    old_values: serializeBilling(previous),
    new_values: serializeBilling(nextBilling),
    stripe_event_id: eventId,
    stripe_event_type: eventType,
  });
};

const handleSubscriptionUpdate = async (
  subscription: Stripe.Subscription,
  eventType: string,
  eventId: string,
  statusOverride?: BillingInfo["status"],
  planOverride?: BillingInfo["plan"]
) => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  if (!customerId) return;

  const col = getUsersCollection();
  const user = await col.findOne({ "billing.stripe_customer_id": customerId });
  if (!user) return;

  const nextBilling = billingFromSubscription(
    subscription,
    planOverride,
    statusOverride
  );
  await updateUserBilling({
    userId: user._id,
    nextBilling,
    eventId,
    eventType,
  });
};

export default async function billingRoutes(app: FastifyInstance) {
  app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
  });

  app.post(
    "/activate-pro-promo",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const userId = request.user?.id;
      if (!userId || !ObjectId.isValid(userId)) {
        return fail(request, reply, "NOT_FOUND", "User not found.", 404);
      }

      const users = getUsersCollection();
      const user = await users.findOne({ _id: new ObjectId(userId) });
      if (!user) {
        return fail(request, reply, "NOT_FOUND", "User not found.", 404);
      }

      if (user.role !== "seller") {
        return fail(request, reply, "FORBIDDEN", "Seller role required.", 403);
      }

      const entitlements = getSellerEntitlements({
        plan: "pro",
        role: user.role,
        now: new Date(),
      });
      if (!entitlements.promoActive) {
        return fail(request, reply, "promo_inactive", "Launch promo is inactive.", 403);
      }

      const billing = normalizeBilling(user.billing ?? defaultBilling());
      if (
        billing.plan === "pro" &&
        billing.isPromo === true &&
        billing.status === "active"
      ) {
        return ok(request, { success: true });
      }

      const updateResult = await users.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            "billing.plan": "pro",
            "billing.isPromo": true,
            "billing.status": "active",
            "billing.current_period_end": null,
          },
        }
      );

      if (updateResult.modifiedCount !== 1) {
        return fail(request, reply, "promo_not_applied", "Promo could not be applied.", 409);
      }

      const updatedUser = await users.findOne({ _id: user._id });
      const updatedBilling = normalizeBilling(updatedUser?.billing ?? defaultBilling());
      if (
        updatedBilling.plan !== "pro" ||
        updatedBilling.isPromo !== true ||
        updatedBilling.status !== "active"
      ) {
        return fail(request, reply, "promo_not_applied", "Promo could not be applied.", 409);
      }

      return ok(request, { success: true });
    }
  );

  app.post(
    "/create-checkout-session",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!env.BILLING_ENABLED) {
        return fail(
          request,
          reply,
          "billing_disabled",
          "Billing is not enabled.",
          503
        );
      }

      const payload = createCheckoutSchema.parse(request.body);
      const userId = request.user?.id;
      if (!userId || !ObjectId.isValid(userId)) {
        return fail(request, reply, "NOT_FOUND", "User not found.", 404);
      }

      const col = getUsersCollection();
      const user = await col.findOne({ _id: new ObjectId(userId) });
      if (!user) {
        return fail(request, reply, "NOT_FOUND", "User not found.", 404);
      }

      const billing = normalizeBilling(user.billing ?? defaultBilling());

      if (!shouldUseStripeCheckout({ role: user.role, plan: payload.plan })) {
        return fail(
          request,
          reply,
          "CHECKOUT_NOT_ALLOWED",
          "Stripe checkout is not available for this role and plan.",
          403
        );
      }

      const stripe = getStripe();
      let stripeCustomerId = billing.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: { user_id: user._id.toHexString() },
        });
        stripeCustomerId = customer.id;
        billing.stripe_customer_id = stripeCustomerId;
        await col.updateOne(
          { _id: user._id },
          { $set: { billing, updatedAt: new Date() } }
        );
      }

      const origin = resolveOrigin(request) ?? config.corsOrigins[0];
      const successUrl = `${origin}/app/upgrade?status=success`;
      const cancelUrl = `${origin}/app/upgrade?status=cancel`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [
          {
            price: priceIdByPlan[payload.plan],
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          user_id: user._id.toHexString(),
          plan: payload.plan,
        },
        subscription_data: {
          metadata: {
            user_id: user._id.toHexString(),
          },
        },
      });

      await writeAuditLog("billing_checkout_created", {
        user_id: user._id.toHexString(),
        new_values: {
          plan: payload.plan,
          stripe_customer_id: stripeCustomerId,
          stripe_session_id: session.id,
        },
        metadata: {
          origin: origin || undefined,
        },
      });

      return ok(request, { url: session.url });
    }
  );

  app.post(
    "/webhook",
    { config: { rawBody: true } },
    async (request, reply) => {
      if (!env.BILLING_ENABLED) {
        return fail(
          request,
          reply,
          "billing_disabled",
          "Billing is not enabled.",
          503
        );
      }

      const sig = Array.isArray(request.headers["stripe-signature"])
        ? request.headers["stripe-signature"][0]
        : request.headers["stripe-signature"];
      if (!sig) {
        return reply.status(400).send({ error: "Missing Stripe-Signature header" });
      }

      const rawBody =
        request.rawBody ??
        (typeof request.body === "string"
          ? request.body
          : request.body
            ? JSON.stringify(request.body)
            : undefined);
      if (!rawBody) {
        return reply.status(400).send({ error: "Missing raw body" });
      }

      let event: Stripe.Event;
      try {
        const webhookSecret = requireStripeWebhookSecret();
        const stripe = getStripe();
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } catch (error: any) {
        return reply.status(400).send({ error: `Webhook Error: ${error.message}` });
      }

      const eventsCollection = await getStripeWebhookEventsCollection();
      const receivedAt = new Date();
      const resolvedUserId = await resolveUserIdFromEvent(event);
      try {
        await eventsCollection.insertOne({
          stripe_event_id: event.id,
          stripe_event_type: event.type,
          received_at: receivedAt,
          status: "received",
          user_id: resolvedUserId,
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          await eventsCollection.updateOne(
            { stripe_event_id: event.id },
            { $set: { status: "duplicate" } }
          );
          await writeAuditLog("webhook_duplicate", {
            user_id: resolvedUserId,
            stripe_event_id: event.id,
            stripe_event_type: event.type,
            metadata: {
              outcome: "duplicate",
              requestId: request.id,
            },
          });
          return reply.status(200).send({ ok: true, duplicate: true });
        }

        await writeAuditLog("webhook_failed", {
          user_id: resolvedUserId,
          stripe_event_id: event.id,
          stripe_event_type: event.type,
          metadata: {
            outcome: "failed",
            reason: "db_error",
            requestId: request.id,
          },
        });
        return reply.status(500).send({ error: "Failed to record webhook event" });
      }

      await writeAuditLog("webhook_received", {
        user_id: resolvedUserId,
        stripe_event_id: event.id,
        stripe_event_type: event.type,
        metadata: {
          outcome: "received",
          requestId: request.id,
        },
      });

      try {
        const stripe = getStripe();
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            if (!session.subscription) break;
            const purchasedPlan =
              session.metadata?.plan === "pro" || session.metadata?.plan === "enterprise"
                ? session.metadata.plan
                : undefined;
            const subscription =
              typeof session.subscription === "string"
                ? await stripe.subscriptions.retrieve(session.subscription)
                : session.subscription;
            if (!subscription) break;
            await handleSubscriptionUpdate(
              subscription,
              event.type,
              event.id,
              "active",
              purchasedPlan
            );
            break;
          }
          case "customer.subscription.updated": {
            const subscription = event.data.object as Stripe.Subscription;
            await handleSubscriptionUpdate(subscription, event.type, event.id);
            break;
          }
          case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription;
            await handleSubscriptionUpdate(
              subscription,
              event.type,
              event.id,
              "inactive",
              "free"
            );
            break;
          }
          case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice;
            if (!invoice.subscription) break;
            const subscription = await stripe.subscriptions.retrieve(
              invoice.subscription as string
            );
            await handleSubscriptionUpdate(
              subscription,
              event.type,
              event.id,
              "past_due"
            );
            break;
          }
          default:
            break;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await eventsCollection.updateOne(
          { stripe_event_id: event.id },
          { $set: { status: "failed", error_message: errorMessage } }
        );
        await writeAuditLog("webhook_failed", {
          user_id: resolvedUserId,
          stripe_event_id: event.id,
          stripe_event_type: event.type,
          metadata: {
            outcome: "failed",
            reason: "processing_error",
            requestId: request.id,
          },
          new_values: {
            error_message: errorMessage,
          },
        });
        return reply.status(500).send({ error: "Webhook processing failed" });
      }

      await eventsCollection.updateOne(
        { stripe_event_id: event.id },
        { $set: { status: "processed", processed_at: new Date() } }
      );
      await writeAuditLog("webhook_processed", {
        user_id: resolvedUserId,
        stripe_event_id: event.id,
        stripe_event_type: event.type,
        metadata: {
          outcome: "processed",
          requestId: request.id,
        },
      });

      return reply.status(200).send({ received: true });
    }
  );
}

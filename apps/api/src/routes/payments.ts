import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { config } from "../config.js";
import { ok, fail } from "../response.js";

let stripe: Stripe | null = null;

if (config.stripe.secretKey) {
  stripe = new Stripe(config.stripe.secretKey, {  });
}

export default async function paymentRoutes(app: FastifyInstance) {
  // POST /api/payments/checkout — create checkout session
  app.post("/checkout", { preHandler: app.authenticate }, async (request, reply) => {
    if (!stripe || !config.stripe.priceId) {
      return fail(request, reply, "STRIPE_ERROR", "Stripe not configured", 503);
    }

    const user = (request as any).user;

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        customer_email: user.email,
        line_items: [
          {
            price: config.stripe.priceId,
            quantity: 1,
          },
        ],
        success_url: `${config.stripe.clientUrl}/checkout/success`,
        cancel_url: `${config.stripe.clientUrl}/checkout/cancel`,
        metadata: {
          userId: user.id,
        },
      });

      return ok(request, { sessionId: session.id, url: session.url });
    } catch (err: any) {
      return fail(request, reply, "STRIPE_ERROR", err.message, 500);
    }
  });

  // POST /api/payments/webhook — Stripe webhook
  app.post("/webhook", async (request, reply) => {
    if (!stripe || !config.stripe.webhookSecret) {
      return reply.status(503).send({ error: "Webhook not configured" });
    }

    const sig = request.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        (request as any).rawBody,
        sig as string,
        config.stripe.webhookSecret
      );
    } catch (err: any) {
      request.log.error(err);
      return reply.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        request.log.info({ sessionId: session.id }, "Payment success");
        break;

      case "customer.subscription.deleted":
        const sub = event.data.object;
        request.log.info({ subscriptionId: sub.id }, "Subscription cancelled");
        break;

      default:
        request.log.info(`Unhandled event type ${event.type}`);
    }

    reply.send({ received: true });
  });
}

import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { config } from "../config.js";
import { ok, fail } from "../response.js";

// Payments are disabled gracefully if Stripe keys are not configured.
const stripeEnabled = Boolean(config.stripe.secretKey && config.stripe.priceId);

const stripe = stripeEnabled
  ? new Stripe(config.stripe.secretKey!, { apiVersion: "2026-02-25.clover" })
  : null;

export default async function paymentRoutes(app: FastifyInstance) {

  app.post("/create-checkout-session", async (request, reply) => {
    if (!stripe || !config.stripe.priceId) {
      return fail(request, reply, "PAYMENTS_DISABLED", "Stripe is not configured.", 503);
    }
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: config.stripe.priceId, quantity: 1 }],
        success_url: `${config.stripe.clientUrl}/upgrade?success=true`,
        cancel_url:  `${config.stripe.clientUrl}/upgrade?canceled=true`,
      });
      return ok(request, { url: session.url, sessionId: session.id });
    } catch (err: any) {
      return fail(request, reply, "STRIPE_ERROR", err.message, 500);
    }
  });

  app.get("/subscription-status", async (request, reply) => {
    if (!stripe) {
      return ok(request, { active: false, plan: "free", reason: "payments_not_configured" });
    }
    try {
      const { email } = request.query as { email?: string };
      if (!email) return fail(request, reply, "BAD_REQUEST", "Email required", 400);

      const customers = await stripe.customers.list({ email, limit: 1 });
      if (!customers.data.length) return ok(request, { active: false, plan: "free" });

      const subscriptions = await stripe.subscriptions.list({
        customer: customers.data[0].id,
        status: "active",
        limit: 1,
      });

      return ok(request, {
        active: subscriptions.data.length > 0,
        plan:   subscriptions.data.length > 0 ? "pro" : "free",
      });
    } catch (err: any) {
      return fail(request, reply, "STRIPE_ERROR", err.message, 500);
    }
  });
}

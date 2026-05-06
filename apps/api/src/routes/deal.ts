// apps/api/src/routes/deal.ts
import type { FastifyInstance } from "fastify";
import { evaluateDeal, checkDealEngineHealth, DealRequest } from "../lib/dealClient.js";
import { ok, fail } from "../response.js";

export default async function dealRoutes(app: FastifyInstance) {
  /**
   * GET /api/deal/health
   * Check if the Python deal engine is reachable
   */
  app.get("/health", async (request, reply) => {
    const alive = await checkDealEngineHealth();
    if (!alive) {
      return reply.status(503).send({
        error: { code: "DEAL_ENGINE_UNAVAILABLE", message: "Deal engine is not reachable." },
        requestId: request.requestId,
      });
    }
    return ok(request, { dealEngine: "ok" });
  });

  /**
   * POST /api/deal/evaluate
   * Evaluate a listing through the Python margin engine
   * Auth required
   */
  app.post(
    "/evaluate",
    { preHandler: async (request, reply) => { const isDemo = process.env.DEMO_MODE === "true"; if (isDemo) return; return app.authenticate(request, reply); } },
    async (request, reply) => {
      const body = request.body as DealRequest;

      if (!body?.asking_price || !body?.listing_id) {
        return fail(request, reply, "BAD_REQUEST", "asking_price and listing_id are required.", 400);
      }

      try {
        const result = await evaluateDeal(body);
        return ok(request, result);
      } catch (err: any) {
        app.log.error(err, "Deal engine evaluation failed");
        return fail(request, reply, "DEAL_ENGINE_ERROR", err.message ?? "Evaluation failed.", 502);
      }
    }
  );
}

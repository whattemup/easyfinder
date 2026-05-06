import { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getScoringConfig, setScoringConfig } from "../store.js";
import { ok, fail } from "../response.js";

// Weights schema mirrors SCORING_MODEL.md §8.1 exactly.
// All four dimensions required; refine enforces they sum to 1.0.
const weightsSchema = z.object({
  price:    z.number().min(0).max(1),
  hours:    z.number().min(0).max(1),
  location: z.number().min(0).max(1),
  risk:     z.number().min(0).max(1),
}).refine(
  (w) => Math.abs(w.price + w.hours + w.location + w.risk - 1.0) < 0.01,
  { message: "weights must sum to 1.0 (±0.01)" }
);

const scoringConfigInput = z.object({
  name:            z.string(),
  weights:         weightsSchema,
  preferredStates: z.array(z.string()),
  maxHours:        z.number().positive(),
  maxPrice:        z.number().positive(),
});

export default async function scoringRoutes(app: FastifyInstance) {
  app.get("/", async (request) => ok(request, { config: getScoringConfig() }));

  app.post("/", { preHandler: app.authenticate }, async (request, reply) => {
    const role = request.user?.role ?? "demo";
    if (role !== "buyer" && role !== "admin") {
      return fail(request, reply, "FORBIDDEN", "Buyer access only.", 403);
    }

    const payload = scoringConfigInput.parse(request.body);
    const next = { id: nanoid(), ...payload, active: true };
    setScoringConfig(next);
    return ok(request, { config: next });
  });
}

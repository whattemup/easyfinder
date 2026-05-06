import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ok, fail } from "../response.js";
import { analyzeIntelligence } from "../intelligence.js";

const intelligenceSchema = z.object({
  title: z.string().optional(),
  category: z.string().optional(),
  year: z.number().int().optional(),
  hours: z.number().optional(),
  price: z.number().nullable().optional(),
  condition: z.number().min(1).max(5).optional(),
  hasServiceHistory: z.boolean().optional(),
  hasInspectionReport: z.boolean().optional(),
  verifiedSeller: z.boolean().optional(),
  state: z.string().optional(),
});

export default async function intelligenceRoutes(app: FastifyInstance) {
  app.post("/analyze", async (request, reply) => {
    const input = intelligenceSchema.safeParse(request.body);
    if (!input.success) {
      return fail(request, reply, "BAD_REQUEST", "Invalid input.", 400);
    }
    const result = analyzeIntelligence(input.data);
    return ok(request, result);
  });
}

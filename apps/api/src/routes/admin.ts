import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { listings, sourceHealth } from "../store.js";
import { Listing } from "@easyfinderai/shared";
import { fail, ok } from "../response.js";
import { requirePlan } from "../middleware/requirePlan.js";
import { disableWritesInDemo } from "../middleware/disableWritesInDemo.js";

const adminOnly = new Set(["admin"]);
const fallbackImages = [
  "/demo-images/other/1.jpg",
  "/demo-images/other/2.jpg",
  "/demo-images/other/3.jpg",
  "/demo-images/other/4.jpg",
  "/demo-images/other/5.jpg",
];

const csvSchema = z.object({
  title: z.string(),
  description: z.string().default(""),
  state: z.string(),
  price: z.coerce.number(),
  hours: z.coerce.number(),
  operable: z.coerce.boolean(),
  category: z.string(),
  source: z.string(),
});

const requireAuthenticatedUserId = (request: FastifyRequest, reply: FastifyReply) => {
  const userId = request.user?.id;
  if (!userId) {
    fail(request, reply, "UNAUTHORIZED", "Authentication required.", 401);
    return null;
  }
  return userId;
};

export default async function adminRoutes(app: FastifyInstance) {
  app.post(
    "/ingest/csv",
    { preHandler: [app.authenticate, requirePlan(["enterprise"]), disableWritesInDemo] },
    async (request, reply) => {
    const userId = requireAuthenticatedUserId(request, reply);
    if (!userId) {
      return;
    }
    const userRole = request.user?.role;
    if (!userRole || !adminOnly.has(userRole)) {
      return fail(request, reply, "FORBIDDEN", "Admin access only.", 403);
    }
    const data = await request.file();
    if (!data) {
      return fail(request, reply, "NO_FILE", "CSV file required.", 400);
    }
    const content = await data.toBuffer();
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const normalized: Listing[] = records.map((record: Record<string, string>, index: number) => {
      const parsed = csvSchema.parse(record);
      return {
        id: `csv-${Date.now()}-${index}`,
        title: parsed.title,
        description: parsed.description,
        state: parsed.state,
        price: parsed.price,
        hours: parsed.hours,
        operable: parsed.operable,
        category: parsed.category,
        images: fallbackImages,
        imageUrl: fallbackImages[0],
        source: parsed.source,
        createdAt: new Date().toISOString(),
      };
    });

    listings.push(...normalized);

    return ok(request, { ingested: normalized.length });
    }
  );

  app.post(
    "/sources/sync",
    { preHandler: [app.authenticate, requirePlan(["enterprise"]), disableWritesInDemo] },
    async (request, reply) => {
    const userId = requireAuthenticatedUserId(request, reply);
    if (!userId) {
      return;
    }
    const userRole = request.user?.role;
    if (!userRole || !adminOnly.has(userRole)) {
      return fail(request, reply, "FORBIDDEN", "Admin access only.", 403);
    }

    const now = new Date().toISOString();
    Array.from(sourceHealth.keys()).forEach((source) => {
      sourceHealth.set(source, { status: "healthy", lastSync: now });
    });

    listings.push({
      id: `mock-${Date.now()}`,
      title: "Mock Connector Excavator",
      description: "Simulated listing from compliant mock connector.",
      state: "TX",
      price: 125000,
      hours: 4200,
      operable: true,
      category: "Excavator",
      images: fallbackImages,
      imageUrl: fallbackImages[0],
      source: "mock-feed",
      createdAt: now,
    });

    return ok(request, { status: "sync_started", syncedAt: now });
    }
  );

  app.get(
    "/sources",
    { preHandler: [app.authenticate, requirePlan(["enterprise"])] },
    async (request, reply) => {
    const userId = requireAuthenticatedUserId(request, reply);
    if (!userId) {
      return;
    }
    const userRole = request.user?.role;
    if (!userRole || !adminOnly.has(userRole)) {
      return fail(request, reply, "FORBIDDEN", "Admin access only.", 403);
    }

    const sources = Array.from(sourceHealth.entries()).map(([name, data]) => ({
      name,
      ...data,
    }));

    return ok(request, { sources });
    }
  );
}

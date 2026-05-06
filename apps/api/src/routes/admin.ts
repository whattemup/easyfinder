import { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { listings, sourceHealth } from "../store.js";
import { Listing } from "@easyfinderai/shared";
import { fail, ok } from "../response.js";

const adminOnly = new Set(["admin"]);

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

export default async function adminRoutes(app: FastifyInstance) {
  app.post("/ingest/csv", { preHandler: app.authenticate }, async (request, reply) => {
    if (!adminOnly.has(request.user.role)) {
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
        imageUrl: undefined,
        source: parsed.source,
        createdAt: new Date().toISOString(),
      };
    });

    listings.push(...normalized);

    return ok(request, { ingested: normalized.length });
  });

  app.post("/sources/sync", { preHandler: app.authenticate }, async (request, reply) => {
    if (!adminOnly.has(request.user.role)) {
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
      imageUrl: undefined,
      source: "mock-feed",
      createdAt: now,
    });

    return ok(request, { status: "sync_started", syncedAt: now });
  });

  app.get("/sources", { preHandler: app.authenticate }, async (request, reply) => {
    if (!adminOnly.has(request.user.role)) {
      return fail(request, reply, "FORBIDDEN", "Admin access only.", 403);
    }

    const sources = Array.from(sourceHealth.entries()).map(([name, data]) => ({
      name,
      ...data,
    }));

    return ok(request, { sources });
  });
}

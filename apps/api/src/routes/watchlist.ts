import { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { watchlists, demoUserId } from "../store.js";
import { ok, fail } from "../response.js";
import { WatchlistItem } from "@easyfinderai/shared";

export default async function watchlistRoutes(app: FastifyInstance) {

  app.get("/", async (request) => {
    const userId = (request.user as any)?.id ?? demoUserId;
    const watchlist = watchlists.get(userId) ?? new Map<string, WatchlistItem>();
    return ok(request, { items: Array.from(watchlist.values()) });
  });

  app.post("/", async (request, reply) => {
    const userId = (request.user as any)?.id ?? demoUserId;
    const { listingId } = z.object({ listingId: z.string() }).parse(request.body);

    // Accept any non-empty listingId — in demo mode listings come from the
    // in-memory store; in DB mode they come from Postgres. Validating against
    // the in-memory array would reject all DB-sourced listing IDs.
    if (!listingId) {
      return fail(request, reply, "BAD_REQUEST", "listingId is required.", 400);
    }

    const watchlist = watchlists.get(userId) ?? new Map<string, WatchlistItem>();
    const item: WatchlistItem = {
      id: nanoid(),
      userId,
      listingId,
      createdAt: new Date().toISOString(),
    };
    watchlist.set(listingId, item);
    watchlists.set(userId, watchlist);
    return ok(request, { item });
  });

  app.delete("/:listingId", async (request, reply) => {
    const userId = (request.user as any)?.id ?? demoUserId;
    const { listingId } = z.object({ listingId: z.string() }).parse(request.params);
    const watchlist = watchlists.get(userId);
    if (!watchlist?.has(listingId)) {
      return fail(request, reply, "NOT_FOUND", "Item not in watchlist.", 404);
    }
    watchlist.delete(listingId);
    return ok(request, { removed: listingId });
  });
}

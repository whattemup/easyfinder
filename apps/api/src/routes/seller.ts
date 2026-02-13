import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { listings } from "../store.js";
import { fail, ok } from "../response.js";
import { requireNDA } from "../middleware/requireNDA.js";

const sellerOnly = new Set(["seller", "admin"]);

const requireAuthenticatedUserId = (request: FastifyRequest, reply: FastifyReply) => {
  const userId = request.user?.id;
  if (!userId) {
    fail(request, reply, "UNAUTHORIZED", "Authentication required.", 401);
    return null;
  }
  return userId;
};

export default async function sellerRoutes(app: FastifyInstance) {
  app.get("/insights", { preHandler: [app.authenticate, requireNDA] }, async (request, reply) => {
    const userId = requireAuthenticatedUserId(request, reply);
    if (!userId) {
      return;
    }
    const userRole = request.user?.role;
    if (!userRole || !sellerOnly.has(userRole)) {
      return fail(request, reply, "FORBIDDEN", "Seller access only.", 403);
    }

    const atRiskListings = listings
      .filter((listing) => (listing.hours ?? 0) > 7000 || (listing.price ?? 0) > 220000)
      .slice(0, 5);

    const priceBands = listings.slice(0, 4).map((listing) => ({
      listingId: listing.id,
      range: {
        min: (listing.price ?? 0) * 0.9,
        max: (listing.price ?? 0) * 1.1,
      },
      state: listing.state,
    }));

    const qualityChecklistSummary = {
      total: listings.length,
      missingImages: listings.filter((listing) => !listing.imageUrl).length,
      missingDescriptions: listings.filter((listing) => !listing.description).length,
    };

    return ok(request, {
      atRiskListings,
      priceBands,
      qualityChecklistSummary,
    });
  });
}

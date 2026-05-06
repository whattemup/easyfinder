import { FastifyInstance } from "fastify";
import { ok, fail } from "../response.js";
import { getListingsCollection } from "../listings.js";

const sellerOnly = new Set(["seller"]);

export default async function sellerRoutes(app: FastifyInstance) {
  // GET /api/seller/insights — seller dashboard
  app.get("/insights", { preHandler: app.authenticate }, async (request, reply) => {
    if (!sellerOnly.has(request.user.role)) {
      return fail(request, reply, "FORBIDDEN", "Seller access only.", 403);
    }

    const sellerId = request.user.id;
    const sellerListings = await getListingsCollection().findSellerListings(sellerId);

    const total = sellerListings.length;
    const withPrice = sellerListings.filter((l: any) => l.price != null);
    const avgPrice = withPrice.length
      ? Math.round(withPrice.reduce((s: number, l: any) => s + l.price, 0) / withPrice.length)
      : null;
    const withHours = sellerListings.filter((l: any) => l.hours != null);
    const avgHours = withHours.length
      ? Math.round(withHours.reduce((s: number, l: any) => s + l.hours, 0) / withHours.length)
      : null;
    const missingImages = sellerListings.filter((l: any) => !l.imageUrl).length;
    const missingDescriptions = sellerListings.filter((l: any) => !l.description?.trim()).length;
    const atRisk = sellerListings
      .filter((l: any) => (l.hours ?? 0) > 7000 || (l.price ?? 0) > 220000)
      .slice(0, 5)
      .map((l: any) => ({ id: l.id, title: l.title, hours: l.hours, price: l.price }));

    return ok(request, {
      sellerId,
      totalListings: total,
      avgPrice,
      avgHours,
      atRiskListings: atRisk,
      qualityChecklist: {
        total,
        missingImages,
        missingDescriptions,
      },
    });
  });
}

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { fail, ok } from "../response.js";
import { getUsersCollection } from "../users.js";
import { getInquiriesCollection, InquiryDocument } from "../inquiries.js";
import { getListingsCollection } from "../listings.js";
import { getContactBlockReason } from "../lib/contactInfoBlocker.js";
import { insertAuditEvent } from "../audit.js";

const buyerOrAdminOnly = new Set(["buyer", "admin"]);

const createInquirySchema = z.object({
  listingId: z.string().min(1),
  message: z.string().max(2000),
});

const openStatuses: InquiryDocument["status"][] = ["new", "reviewing", "contacted"];

const toInquiryDto = (inquiry: InquiryDocument) => ({
  id: inquiry._id.toHexString(),
  listingId: inquiry.listingId,
  buyerName: inquiry.buyerName,
  buyerEmail: inquiry.buyerEmail,
  message: inquiry.message,
  status: inquiry.status,
  createdAt: inquiry.createdAt,
});

const toThreadMessages = (inquiry: InquiryDocument) => {
  const initial = {
    id: `${inquiry._id.toHexString()}-initial`,
    senderRole: "buyer" as const,
    body: inquiry.message,
    createdAt: inquiry.createdAt,
  };

  return [initial, ...(inquiry.messages ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
};

export default async function inquiriesRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (request, reply) => {
    if (!buyerOrAdminOnly.has(request.user.role)) {
      return fail(request, reply, "FORBIDDEN", "Buyer or admin access required.", 403);
    }

    const isAdmin = request.user.role === "admin";
    const inquiries = isAdmin
      ? await getInquiriesCollection().findMany()
      : (await getInquiriesCollection().findMany()).filter((inquiry) => inquiry.buyerId === request.user.id);

    inquiries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return ok(request, inquiries.map(toInquiryDto));
  });

  app.get("/:id", { preHandler: app.authenticate }, async (request, reply) => {
    if (!buyerOrAdminOnly.has(request.user.role)) {
      return fail(request, reply, "FORBIDDEN", "Buyer or admin access required.", 403);
    }

    const { id } = request.params as { id: string };
    const inquiry = await getInquiriesCollection().findById(id);
    if (!inquiry) {
      return fail(request, reply, "NOT_FOUND", "Inquiry not found.", 404);
    }

    const isAdmin = request.user.role === "admin";
    if (!isAdmin && inquiry.buyerId !== request.user.id) {
      return fail(request, reply, "FORBIDDEN", "You do not have access to this inquiry.", 403);
    }

    const listing = await getListingsCollection().findById(inquiry.listingId);

    return ok(request, {
      id: inquiry._id.toHexString(),
      listingId: inquiry.listingId,
      listingTitle: listing?.title ?? null,
      buyerId: inquiry.buyerId,
      status: inquiry.status,
      createdAt: inquiry.createdAt,
      messages: toThreadMessages(inquiry),
    });
  });

  app.post("/", { preHandler: app.authenticate }, async (request, reply) => {
    if (!buyerOrAdminOnly.has(request.user.role)) {
      return fail(request, reply, "FORBIDDEN", "Buyer or admin access required.", 403);
    }

    const payload = createInquirySchema.parse(request.body);
    const message = payload.message.trim();

    if (!message) {
      return fail(request, reply, "BAD_REQUEST", "Message is required.", 400);
    }

    const reasonType = getContactBlockReason(message);
    if (reasonType) {
      await insertAuditEvent({
        actorUserId: request.user.id,
        actorEmail: request.user.email ?? "",
        action: "MESSAGE_BLOCKED",
        targetType: "inquiry",
        targetId: payload.listingId,
        reason: reasonType,
        before: null,
        after: {
          inquiryId: null,
          sellerId: null,
          buyerId: request.user.id,
          reasonType,
        },
        requestId: request.requestId,
      });

      return fail(
        request,
        reply,
        "CONTACT_INFO_BLOCKED",
        "For safety, don’t share phone numbers, emails, or social handles. Use EasyFinder messaging only.",
        400
      );
    }

    if (!ObjectId.isValid(request.user.id)) {
      return fail(request, reply, "NOT_FOUND", "Buyer not found.", 404);
    }

    const usersCollection = getUsersCollection();
    const buyer = await usersCollection.findOne({ _id: new ObjectId(request.user.id) });
    if (!buyer) {
      return fail(request, reply, "NOT_FOUND", "Buyer not found.", 404);
    }

    const existingInquiries = await getInquiriesCollection().findMany();
    const hasOpenInquiry = existingInquiries.some(
      (inquiry) =>
        inquiry.buyerId === request.user.id &&
        inquiry.listingId === payload.listingId &&
        openStatuses.includes(inquiry.status)
    );

    if (hasOpenInquiry) {
      return fail(
        request,
        reply,
        "INQUIRY_EXISTS",
        "You already requested info for this listing.",
        409
      );
    }

    const listing = await getListingsCollection().findById(payload.listingId);
    const sellerId = listing?.source?.startsWith("seller:") ? listing.source.replace("seller:", "") : null;

    const now = new Date();
    const inquiry: InquiryDocument = {
      _id: new ObjectId(),
      listingId: payload.listingId,
      sellerId,
      buyerId: request.user.id,
      buyerEmail: buyer.email,
      buyerName: buyer.name,
      message,
      status: "new",
      createdAt: now,
      updatedAt: now,
    };

    await getInquiriesCollection().insertOne(inquiry);

    // Send email notification to seller
    try {
      if (sellerId && ObjectId.isValid(sellerId)) {
        const seller = await usersCollection.findOne({ _id: new ObjectId(sellerId) });
        if (seller?.email) {
          const { sendInquiryNotificationEmail } = await import("../email.js");
          await sendInquiryNotificationEmail({
            to: seller.email,
            buyerName: buyer.name,
            buyerEmail: buyer.email,
            listingTitle: listing?.title ?? payload.listingId,
            message,
          });
        }
      }
    } catch (emailErr) {
      request.log.warn({ emailErr }, "Failed to send inquiry email");
    }

    return ok(request, toInquiryDto(inquiry));
  });
}

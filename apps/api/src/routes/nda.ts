import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { getUsersCollection } from "../users.js";
import { fail, ok } from "../response.js";
import { audit } from "../lib/audit.js";

const acceptSchema = z.object({
  accepted: z.literal(true),
});

export default async function ndaRoutes(app: FastifyInstance) {
  const usersCollection = () => getUsersCollection();

  app.get("/status", { preHandler: app.authenticate }, async (request) => {
    try {
      const col = usersCollection();
      if (!ObjectId.isValid(request.user.id)) {
        return ok(request, { accepted: false });
      }

      const user = await col.findOne({ _id: new ObjectId(request.user.id) });
      if (!user) {
        return ok(request, { accepted: false });
      }

      return ok(request, {
        accepted: Boolean(user.ndaAccepted),
      });
    } catch {
      return ok(request, { accepted: false });
    }
  });

  app.post("/accept", { preHandler: app.authenticate }, async (request, reply) => {
    const col = usersCollection();
    acceptSchema.parse(request.body);

    if (!ObjectId.isValid(request.user.id)) {
      return fail(request, reply, "NOT_FOUND", "User not found.", 404);
    }

    const now = new Date();
    const updateResult = await col.updateOne(
      { _id: new ObjectId(request.user.id) },
      {
        $set: {
          ndaAccepted: true,
          ndaAcceptedAt: now,
          ndaVersion: "v1",
        },
      }
    );

    if (!updateResult.matchedCount) {
      return fail(request, reply, "NOT_FOUND", "User not found.", 404);
    }

    audit("NDA_ACCEPTED", {
      userId: request.user.id,
      ndaVersion: "v1",
      ip: request.ip,
    });

    return ok(request, { accepted: true });
  });
}

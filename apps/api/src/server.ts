import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { AuthUser, getRoleFromRequest } from "./auth.js";
import { getUsersCollection } from "./users.js";
import { ObjectId } from "mongodb";
import listingRoutes from "./routes/listings.js";
import demoListingRoutes from "./routes/demo-listings.js";
import scoringRoutes from "./routes/scoring.js";
import watchlistRoutes from "./routes/watchlist.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import sellerRoutes from "./routes/seller.js";
import ndaRoutes from "./routes/nda.js";
import billingRoutes from "./routes/billing.js";
import offersRoutes from "./routes/offers.js";
import { ZodError } from "zod";
import { env } from "./env.js";
import meRoutes from "./routes/me.js";

/**
 * Type augmentation so TS knows about:
 * - request.requestId
 * - app.authenticate
 */
declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}


export const buildServer = () => {
  const app = Fastify({ logger: true });
  const frontendOrigins = new Set(
    [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://easyfinder.vercel.app",
      "https://web-easyfinder.vercel.app",
      ...config.corsOrigins,
    ].map((origin) => origin.toLowerCase())
  );
  frontendOrigins.delete("*");
  const vercelPreviewRegex = /^https:\/\/.+\.vercel\.app$/i;

  if (env.DEMO_MODE) {
    app.log.warn("DEMO_MODE ENABLED - serving demo inventory");
  }

  // Ensure requestId exists on request early
  app.decorateRequest("requestId", "");

  // CORS
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow non-browser tools (curl/postman) or same-origin cases where origin is undefined
      if (!origin) return cb(null, true);

      const normalizedOrigin = origin.toLowerCase();
      const isVercelOrigin = vercelPreviewRegex.test(normalizedOrigin);

      if (frontendOrigins.has(normalizedOrigin) || isVercelOrigin) {
        return cb(null, true);
      }

      return cb(null, false);
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });

  // Security headers
  app.register(helmet);
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    return payload;
  });

  // JWT
  app.register(jwt, {
    secret: config.jwtSecret,
  });

  // Auth decorator (used by routes as preHandler: app.authenticate)
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify<AuthUser>();
      let ndaAccepted = Boolean(payload.ndaAccepted);
      let ndaAcceptedAt = payload.ndaAcceptedAt ?? null;

      if (ObjectId.isValid(payload.id)) {
        const col = getUsersCollection();
        const user = await col.findOne({ _id: new ObjectId(payload.id) });
        ndaAccepted = Boolean(user?.ndaAccepted);
        ndaAcceptedAt = user?.ndaAcceptedAt ?? null;
      }

      request.user = {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        ndaAccepted,
        ndaAcceptedAt,
      };
    } catch {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
          requestId: request.requestId,
        },
      });
    }
  });

  // Rate limiting
  app.register(rateLimit, {
    timeWindow: "1 minute",
    max: (request: FastifyRequest) => {
      const role = getRoleFromRequest(request as any);
      if (role === "seller") return 240;
      if (role === "buyer") return 120;
      return 30;
    },
  });

  // File uploads
  app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
  });

  // Request ID + optional auth
  app.addHook("onRequest", async (request, reply) => {
    const requestId = nanoid();
    request.requestId = requestId;
    reply.header("x-request-id", requestId);

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = await request.jwtVerify<AuthUser>();
        request.user = {
          id: payload.id,
          email: payload.email,
          name: payload.name,
          role: payload.role,
          ndaAccepted: payload.ndaAccepted,
          ndaAcceptedAt: payload.ndaAcceptedAt ?? null,
        };
      } catch {
        // ignore, optional auth
      }
    }
  });

  // Central error handler
  app.setErrorHandler((error: any, request, reply) => {
    request.log.error(error);

    const isZod = error instanceof ZodError;
    const status = error.statusCode ?? (isZod ? 400 : 500);
    const code = isZod ? "BAD_REQUEST" : error.code ?? "SERVER_ERROR";
    const message = isZod ? "Invalid request." : error.message ?? "Unexpected error";

    reply.status(status).send({
      error: {
        code,
        message,
      },
      requestId: request.requestId,
    });
  });

  // Routes
  app.get("/api/cors-test", async (_request, reply) => {
    return reply.send({ ok: true });
  });
  app.get("/health", async (_request, reply) => {
    return reply.send({
      ok: true,
      demoMode: env.DEMO_MODE,
      billingEnabled: env.BILLING_ENABLED,
    });
  });
  app.get("/ready", async (_request, reply) => {
    return reply.send({ ready: true });
  });
  app.register(healthRoutes, { prefix: "/api" });
  app.register(demoListingRoutes, { prefix: "/api/demo/listings" });
  app.register(listingRoutes, { prefix: "/api/listings" });
  app.register(scoringRoutes, { prefix: "/api/scoring-configs" });
  app.register(watchlistRoutes, { prefix: "/api/watchlist" });
  app.register(offersRoutes, { prefix: "/api/offers" });
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(adminRoutes, { prefix: "/api/admin" });
  app.register(sellerRoutes, { prefix: "/api/seller" });
  app.register(meRoutes, { prefix: "/api/me" });
  app.register(ndaRoutes, { prefix: "/api/nda" });
  if (env.BILLING_ENABLED === true) {
    app.register(billingRoutes, { prefix: "/api/billing" });
  }

  return app;
};

import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { AuthUser, getRoleFromRequest, UserRole } from "./auth.js";
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
import uploadsRoutes from "./routes/uploads.js";
import ndaRoutes from "./routes/nda.js";
import billingRoutes from "./routes/billing.js";
import offersRoutes from "./routes/offers.js";
import inquiriesRoutes from "./routes/inquiries.js";
import imageRoutes from "./routes/images.js";
import { ZodError } from "zod";
import { env } from "./env.js";
import meRoutes from "./routes/me.js";
import ironPlanetScraperRoutes from "./routes/scrapers.ironplanet.js";
import dealRoutes from "./routes/deal.js";
import emailRoutes from "./routes/emails.js";
import brokerRoutes from "./routes/broker.js";
import intelligenceRoutes from "./routes/intelligence.js";

const normalizeRole = (role: unknown): UserRole => {
  if (
    role === "buyer" ||
    role === "seller" ||
    role === "admin" ||
    role === "demo" ||
    role === "enterprise"
  ) {
    return role;
  }

  return "buyer";
};



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

  if (env.DEMO_MODE) {
    app.log.warn("DEMO_MODE ENABLED - serving demo inventory");
  }

  // Ensure requestId exists on request early
  app.decorateRequest("requestId", "");

  // CORS
  app.register(cors, {
    origin: true,
    credentials: true,
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
        role: normalizeRole(payload.role),
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
  if (env.NODE_ENV === "production") {
    app.register(rateLimit, {
      global: true,
      timeWindow: "1 minute",
      max: (request: FastifyRequest) => {
        const path = (request as any).routerPath ?? request.url;
        if (path?.startsWith("/api/auth/register") || path?.startsWith("/api/auth/login")) {
          return 120;
        }

        const role = getRoleFromRequest(request as any);
        if (role === "seller") return 240;
        if (role === "buyer") return 120;
        return 60;
      },
      addHeaders: {
        "x-ratelimit-limit": true,
        "x-ratelimit-remaining": true,
        "x-ratelimit-reset": true,
        "retry-after": true,
      },
    });
  }

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
          role: normalizeRole(payload.role),
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

    if (error?.statusCode === 429) {
      const retryAfter =
        typeof error?.headers?.["retry-after"] === "string" ? error.headers["retry-after"] : "60";
      reply.header("Retry-After", retryAfter);
      return reply.status(429).send({
        error: {
          code: "RATE_LIMITED",
          message: `Rate limit exceeded. Try again in ${retryAfter}s.`,
        },
        requestId: request.requestId,
      });
    }

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
  app.register(emailRoutes, { prefix: "/api/emails" });
  app.register(inquiriesRoutes, { prefix: "/api/inquiries" });
  app.register(authRoutes, { prefix: "/api/auth" });
  if (env.ADMIN_ENABLED) {
    app.register(adminRoutes, { prefix: "/api/admin" });
  } else {
    app.all("/api/admin/*", async (request, reply) => {
      return reply.status(404).send({
        error: { code: "ADMIN_DISABLED", message: "Admin endpoints are disabled." },
        requestId: request.requestId,
      });
    });
  }
  app.register(sellerRoutes, { prefix: "/api/seller" });
  app.register(uploadsRoutes, { prefix: "/api/uploads" });
  app.register(imageRoutes, { prefix: "/api" });
  app.register(meRoutes, { prefix: "/api/me" });
  app.register(ironPlanetScraperRoutes);
  app.register(ndaRoutes, { prefix: "/api/nda" });
  // Always mount billing routes so promo activation is available in all environments.
  app.register(billingRoutes, { prefix: "/api/billing" });
  app.register(dealRoutes, { prefix: "/api/deal" });
  app.register(brokerRoutes, { prefix: "/api/broker" });
  app.register(intelligenceRoutes, { prefix: "/api/intelligence" });

  return app;
};

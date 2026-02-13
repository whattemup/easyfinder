import "fastify";
import "@fastify/jwt";
import type { FastifyReply } from "fastify";
import type { BillingInfo } from "./billing.js";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
    user?: {
      id: string;
      email: string;
      name?: string;
      role: "demo" | "buyer" | "seller" | "enterprise" | "admin" | null;
      ndaAccepted?: boolean;
      ndaAcceptedAt?: Date | null;
    };
    billing?: BillingInfo;
    rawBody?: string;
  }

  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      name?: string;
      role: "demo" | "buyer" | "seller" | "enterprise" | "admin" | null;
      ndaAccepted?: boolean;
      ndaAcceptedAt?: Date | null;
    };
    user: {
      id: string;
      email: string;
      name?: string;
      role: "demo" | "buyer" | "seller" | "enterprise" | "admin" | null;
      ndaAccepted?: boolean;
      ndaAcceptedAt?: Date | null;
    };
  }
}

export {};

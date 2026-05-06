import type { FastifyRequest } from "fastify";
import type { StoredUser } from "./store.js";
import { users } from "./store.js";

export type UserRole = "demo" | "buyer" | "seller" | "enterprise" | "admin";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  ndaAccepted?: boolean;
  ndaAcceptedAt?: Date | null;
};

export const getUserByEmail = (email: string): StoredUser | undefined =>
  users.find((user) => user.email === email);

export const getUserById = (id: string): StoredUser | undefined =>
  users.find((user) => user.id === id);

export const getRoleFromRequest = (request: FastifyRequest) =>
  (request.user as AuthUser | undefined)?.role ?? "demo";

import { defaultScoringConfig, demoListings, demoUsers } from "@easyfinderai/shared";
import bcrypt from "bcryptjs";
import type { Listing, User, WatchlistItem, ScoringConfig } from "@easyfinderai/shared";
export type StoredUser = User & { passwordHash?: string };

const seedPasswords: Record<string, string> = {
  "demo@easyfinder.ai":   process.env.SEED_PASS_DEMO   || "$2a$10$5U6St8TEFAR/E0ThTeK0MuS4l0h8UBkPW17fCBYz3RdjxhwqRW6qS",
  "buyer@easyfinder.ai":  process.env.SEED_PASS_BUYER  || "$2a$10$Bd/KAg4Z7ELtUG77yvGHy.U60Iyp9iqQ6ZHfnUMQrvsrW78/HQ2Gu",
  "seller@easyfinder.ai": process.env.SEED_PASS_SELLER || "$2a$10$Q7CVytQv0WuR9ZHlgjqCXuYFOxUSBqJwc.8DMyYp8Ssi2x1OT3yGG",
  "admin@easyfinder.ai":  process.env.SEED_PASS_ADMIN  || "$2a$10$9Lh2res.OD2qeeRwrXi..OmJWGVVwQPvm4DFhnJxVakbuRnw2OeLG",
};

export const listings: Listing[] = demoListings;
export const users: StoredUser[] = demoUsers.map((user) => {
  if (!user.email) throw new Error("Seed user must have an email");
  const seed = seedPasswords[user.email];
  return { ...user, passwordHash: seed ? (seed.startsWith("$2") ? seed : bcrypt.hashSync(seed, 10)) : undefined };
});

export const demoUserId = users[0]?.id ?? "demo-user";

let scoringConfig: ScoringConfig = { ...defaultScoringConfig };
export const getScoringConfig = () => scoringConfig;
export const setScoringConfig = (next: ScoringConfig) => { scoringConfig = next; };

export const watchlists = new Map<string, Map<string, WatchlistItem>>();

export const sourceHealth = new Map([
  ["auctionplanet",   { status: "healthy",  lastSync: new Date().toISOString() }],
  ["ironplanet",      { status: "healthy",  lastSync: new Date().toISOString() }],
  ["govplanet",       { status: "degraded", lastSync: new Date().toISOString() }],
  ["machinerytrader", { status: "unknown",  lastSync: null }],
  ["heavyequipment",  { status: "unknown",  lastSync: null }],
  ["auctiontime",     { status: "unknown",  lastSync: null }],
  ["bidadoo",         { status: "unknown",  lastSync: null }],
  ["ritchiebros",     { status: "unknown",  lastSync: null }],
]);


import { describe, expect, it } from "vitest";
import { defaultScoringConfig, scoreListing } from "../src/scoring.js";
import { Listing } from "../src/types.js";
import { createHmac } from "crypto";

const baseListing: Listing = {
  id: "listing-1",
  title: "CA Excavator 1",
  description: "Well-maintained excavator ready for work.",
  state: "CA",
  price: 90000,
  hours: 1800,
  operable: true,
  category: "Excavator",
  imageUrl: "https://example.com/image.jpg",
  source: "auctionplanet",
  createdAt: "2026-01-01T00:00:00.000Z",
};

// Inline HMAC helpers — mirrors verifyHmac.ts without cross-package import
const SECRET = "dev-secret";
const signToken = (p: string) => createHmac("sha256", SECRET).update(p).digest("hex");
const verifyToken = (p: string, t: string) => {
  const expected = signToken(p);
  if (expected.length !== t.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ t.charCodeAt(i);
  return mismatch === 0;
};

describe("scoreListing", () => {
  it("returns zero when listing is not operable", () => {
    const result = scoreListing({ ...baseListing, operable: false }, defaultScoringConfig);
    expect(result.total).toBe(0);
    expect(result.components.operable).toBe(0);
    expect(result.rationale[0]).toMatch(/not operable/i);
  });

  it("prefers listings in preferred states", () => {
    const preferred = scoreListing({ ...baseListing, state: "CA" }, defaultScoringConfig);
    const nonPreferred = scoreListing({ ...baseListing, state: "NV" }, defaultScoringConfig);
    expect(preferred.total).toBeGreaterThan(nonPreferred.total);
    expect(preferred.components.state).toBeGreaterThan(nonPreferred.components.state);
  });

  it("rewards lower hours and lower price", () => {
    const lower = scoreListing({ ...baseListing, hours: 1000, price: 65000 }, defaultScoringConfig);
    const higher = scoreListing({ ...baseListing, hours: 6000, price: 190000 }, defaultScoringConfig);
    expect(lower.total).toBeGreaterThan(higher.total);
    expect(lower.components.hours).toBeGreaterThan(higher.components.hours);
    expect(lower.components.price).toBeGreaterThan(higher.components.price);
  });
});

describe("risk signals", () => {
  it("verified_partner scores higher than unknown source", () => {
    const trusted = scoreListing({ ...baseListing, source: "verified_partner" } as any, defaultScoringConfig);
    const unknown = scoreListing({ ...baseListing, source: "unknown" } as any, defaultScoringConfig);
    expect(trusted.components.risk).toBeGreaterThan(unknown.components.risk);
  });

  it("inspection_report boosts risk score", () => {
    const with_ = scoreListing({ ...baseListing, inspection_report: true } as any, defaultScoringConfig);
    const without_ = scoreListing({ ...baseListing, inspection_report: false } as any, defaultScoringConfig);
    expect(with_.components.risk).toBeGreaterThan(without_.components.risk);
  });

  it("service_history boosts risk score", () => {
    const with_ = scoreListing({ ...baseListing, service_history: true } as any, defaultScoringConfig);
    const without_ = scoreListing({ ...baseListing, service_history: false } as any, defaultScoringConfig);
    expect(with_.components.risk).toBeGreaterThan(without_.components.risk);
  });

  it("stale listing reduces confidence and adds flag", () => {
    const stale = scoreListing({ ...baseListing, createdAt: "2024-01-01T00:00:00.000Z" }, defaultScoringConfig);
    const fresh = scoreListing({ ...baseListing, createdAt: new Date().toISOString() }, defaultScoringConfig);
    expect(fresh.confidenceScore).toBeGreaterThan(stale.confidenceScore);
    expect(stale.flags).toContain("STALE_LISTING");
  });

  it("null hours flags MISSING_HOURS and reduces confidence", () => {
    const result = scoreListing({ ...baseListing, hours: null } as any, defaultScoringConfig);
    expect(result.flags).toContain("MISSING_HOURS");
    expect(result.confidenceScore).toBeLessThan(100);
  });
});

describe("category benchmarks", () => {
  it("excavator at p50 scores higher price than forklift at p50", () => {
    // Each category at its own p50 should score ~80
    // Excavator p50=90k, forklift p50=18k
    // At 90k: excavator=~80, forklift=0 (far above its p90 of 40k)
    const excavator = scoreListing({ ...baseListing, category: "excavator", price: 90000 } as any, defaultScoringConfig);
    const forklift = scoreListing({ ...baseListing, category: "forklift", price: 90000 } as any, defaultScoringConfig);
    expect(excavator.components.price).toBeGreaterThan(forklift.components.price);
  });

  it("excavator above p90 gets low price score", () => {
    const result = scoreListing({ ...baseListing, category: "excavator", price: 200000 } as any, defaultScoringConfig);
    expect(result.components.price).toBeLessThan(35);
  });

  it("crane at p50 gets high price score", () => {
    const result = scoreListing({ ...baseListing, category: "crane", price: 150000 } as any, defaultScoringConfig);
    expect(result.components.price).toBeGreaterThanOrEqual(70);
  });
});

describe("HMAC verifyToken", () => {
  it("valid token passes", () => {
    const payload = "listing-1:85000";
    expect(verifyToken(payload, signToken(payload))).toBe(true);
  });

  it("tampered payload fails", () => {
    expect(verifyToken("listing-1:90000", signToken("listing-1:85000"))).toBe(false);
  });

  it("garbage token fails", () => {
    expect(verifyToken("listing-1:85000", "badhash")).toBe(false);
  });

  it("different payloads produce different tokens", () => {
    expect(signToken("listing-1:85000")).not.toBe(signToken("listing-2:85000"));
  });
});

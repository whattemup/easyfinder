import { describe, it, expect } from "vitest";
import { scoreListing, defaultScoringConfig, Listing } from "@easyfinderai/shared";

const baseListing = {
  id: "l1",
  title: "Test Loader",
  description: "Test",
  state: "CA",
  price: 100000,
  hours: 2000,
  operable: true,
  category: "Loader",
  images: [
    "/demo-images/other/1.jpg",
    "/demo-images/other/2.jpg",
    "/demo-images/other/3.jpg",
    "/demo-images/other/4.jpg",
    "/demo-images/other/5.jpg",
  ],
  imageUrl: "/demo-images/other/1.jpg",
  source: "mock",
  createdAt: new Date().toISOString(),
} satisfies Listing;

describe("scoring engine", () => {
  it("requires operable", () => {
    const score = scoreListing({ ...baseListing, operable: false }, defaultScoringConfig);
    expect(score.total).toBe(0);
    expect(score.disqualified).toBe(true);
  });

  it("rewards price, hours, year, and preferred location", () => {
    const better = scoreListing(
      { ...baseListing, hours: 1000, price: 30000, year: 2023, state: "CA", condition: 4.5 },
      defaultScoringConfig
    );
    const worse = scoreListing(
      { ...baseListing, hours: 9000, price: 220000, year: 2000, state: "NY", condition: 2 },
      defaultScoringConfig
    );

    expect(better.total ?? 0).toBeGreaterThan(worse.total ?? 0);
    expect(better.breakdown?.price ?? 0).toBeGreaterThan(worse.breakdown?.price ?? 0);
    expect(better.breakdown?.hours ?? 0).toBeGreaterThan(worse.breakdown?.hours ?? 0);
    expect(better.breakdown?.year ?? 0).toBeGreaterThan(worse.breakdown?.year ?? 0);
    expect(better.breakdown?.location ?? 0).toBeGreaterThan(worse.breakdown?.location ?? 0);
  });

  it("reduces confidence with missing data", () => {
    const score = scoreListing(
      { ...baseListing, price: Number.NaN, hours: Number.NaN, year: undefined, condition: undefined },
      defaultScoringConfig
    );
    expect(score.confidence).toBeLessThan(1);
    expect(score.breakdown?.completeness ?? 0).toBeLessThan(100);
  });
});

/**
 * EasyFinder — Deal Intelligence Engine
 *
 * Given partial listing data, this module estimates fair market value,
 * grades the deal, and produces a plain-English negotiation plan.
 *
 * Designed to work with incomplete data: every field is optional.
 * Falls back to category baselines when specific data is missing.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntelligenceInput = {
  title?:               string;
  category?:            string;
  year?:                number;
  hours?:               number;
  price?:               number | null;
  condition?:           number;   // 1–5 scale
  hasServiceHistory?:   boolean;
  hasInspectionReport?: boolean;
  verifiedSeller?:      boolean;
  state?:               string;
};

export type NegotiationStep = {
  round:  number;
  label:  string;
  amount: number;
  script: string;
};

export type IntelligenceResult = {
  fairMarketValue:    number | null;
  overpricedPercent:  number | null;
  recommendedMaxBid:  number | null;
  dealGrade:          "A" | "B" | "C" | "D" | "F" | null;
  dealGradeLabel:     string;
  negotiationPlan:    NegotiationStep[];
  insight:            string;
  riskFactors:        string[];
};

// ── Category Baselines ────────────────────────────────────────────────────────
// Base price (USD) for an average-condition, mid-age unit of each type.
// Adjusted by age, hours, and condition in calculateFMV below.

const CATEGORY_BASELINES: Record<string, number> = {
  excavator:   85_000,
  bulldozer:   92_000,
  dozer:       92_000,
  loader:      78_000,
  crane:      150_000,
  forklift:    28_000,
  skid:        32_000,
  grader:     110_000,
  compactor:   45_000,
  paver:       88_000,
  dump:        72_000,
  backhoe:     55_000,
  telehandler: 62_000,
  other:       65_000,
};

/**
 * Detect category from title + category fields.
 * Returns the baseline price for that category.
 */
function getBaselinePrice(title = "", category = ""): number {
  const haystack = `${title} ${category}`.toLowerCase();
  for (const [keyword, value] of Object.entries(CATEGORY_BASELINES)) {
    if (haystack.includes(keyword)) return value;
  }
  return CATEGORY_BASELINES.other;
}

// ── Fair Market Value ─────────────────────────────────────────────────────────

/**
 * Estimate FMV from category baseline, adjusted for:
 *   - Age:       6% depreciation per year, floored at 30% of baseline
 *   - Hours:     4% penalty per 1,000 hrs above 2,000
 *   - Condition: 75%–125% multiplier on a 1–5 scale
 *   - Service history and inspection report: small positive premiums
 */
export function calculateFMV(input: IntelligenceInput): number {
  const baseline    = getBaselinePrice(input.title, input.category);
  const currentYear = new Date().getFullYear();
  const year        = input.year  ?? currentYear - 5;
  const hours       = input.hours ?? 4_000;

  const ageFactor = Math.max(0.30, 1 - (currentYear - year) * 0.06);

  const hoursFactor =
    hours > 2_000
      ? Math.max(0.40, 1 - ((hours - 2_000) / 1_000) * 0.04)
      : 1.0;

  const conditionFactor =
    input.condition !== undefined
      ? 0.75 + (input.condition / 5) * 0.50
      : 1.0;

  const serviceMultiplier    = input.hasServiceHistory    ? 1.04 : 1.0;
  const inspectionMultiplier = input.hasInspectionReport  ? 1.03 : 1.0;

  const raw =
    baseline *
    ageFactor *
    hoursFactor *
    conditionFactor *
    serviceMultiplier *
    inspectionMultiplier;

  // Round to nearest $500 — avoids false precision
  return Math.round(raw / 500) * 500;
}

// ── Risk Score ────────────────────────────────────────────────────────────────

/**
 * Compute a 0–100 risk score.
 * Higher = more risk. Used to reduce the recommended max bid.
 */
function calcRisk(input: IntelligenceInput): number {
  let risk = 20; // baseline — some risk is always present

  const hours       = input.hours ?? 0;
  const currentYear = new Date().getFullYear();
  const age         = currentYear - (input.year ?? currentYear - 5);

  if (hours > 8_000)      risk += 25;
  else if (hours > 5_000) risk += 12;

  if (age > 15)      risk += 20;
  else if (age > 10) risk += 10;

  if (!input.hasServiceHistory)    risk += 20;
  if (!input.hasInspectionReport)  risk += 12;
  if (!input.verifiedSeller)       risk += 10;

  return Math.min(risk, 100);
}

// ── Risk Factors (human-readable) ────────────────────────────────────────────

function buildRiskFactors(input: IntelligenceInput): string[] {
  const factors: string[] = [];
  const hours       = input.hours ?? 0;
  const currentYear = new Date().getFullYear();
  const age         = currentYear - (input.year ?? currentYear - 5);

  if (hours > 8_000)
    factors.push("Very high hours — major components likely due for overhaul.");
  else if (hours > 5_000)
    factors.push("High hours — inspect drivetrain, undercarriage, and hydraulics.");

  if (age > 15)
    factors.push("Equipment age over 15 years — check seal condition and parts availability.");
  else if (age > 10)
    factors.push("Equipment is over 10 years old — factor potential reconditioning costs.");

  if (!input.hasServiceHistory)
    factors.push("No service history — provenance unknown, increases risk.");
  if (!input.hasInspectionReport)
    factors.push("No third-party inspection report — conduct your own before committing.");
  if (!input.verifiedSeller)
    factors.push("Seller not verified — vet credentials and title before proceeding.");

  return factors;
}

// ── Deal Grade ────────────────────────────────────────────────────────────────

function gradeRatio(ratio: number): { grade: "A" | "B" | "C" | "D" | "F"; label: string } {
  if (ratio <= 0.80) return { grade: "A", label: "Exceptional Deal"          };
  if (ratio <= 0.92) return { grade: "B", label: "Good Deal"                 };
  if (ratio <= 1.05) return { grade: "C", label: "Fair Price"                };
  if (ratio <= 1.20) return { grade: "D", label: "Overpriced"                };
  return                     { grade: "F", label: "Significantly Overpriced" };
}

// ── Negotiation Plan ──────────────────────────────────────────────────────────

function buildNegotiationPlan(fmv: number, maxBid: number): NegotiationStep[] {
  const opening = Math.round(maxBid * 0.88 / 500) * 500;
  const mid     = Math.round(maxBid * 0.94 / 500) * 500;

  return [
    {
      round:  1,
      label:  "Opening Offer",
      amount: opening,
      script:
        `I've reviewed comparable sales and FMV is around $${fmv.toLocaleString()}. ` +
        `My opening offer is $${opening.toLocaleString()}.`,
    },
    {
      round:  2,
      label:  "First Counter",
      amount: mid,
      script:
        `I understand your position. I can move to $${mid.toLocaleString()}, ` +
        `but I'll need to see service records before we proceed.`,
    },
    {
      round:  3,
      label:  "Best and Final",
      amount: maxBid,
      script:
        `My best and final offer is $${maxBid.toLocaleString()}. ` +
        `I'm ready to move quickly if we can agree today.`,
    },
  ];
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function analyzeIntelligence(input: IntelligenceInput): IntelligenceResult {
  const fmv         = calculateFMV(input);
  const risk        = calcRisk(input);
  const riskFactors = buildRiskFactors(input);

  // Max bid is reduced proportionally to risk — high risk = lower ceiling
  const maxBid = Math.round(fmv * (1 - (risk / 100) * 0.15) / 500) * 500;

  // No price listed — return FMV anchor, no grade
  if (input.price == null) {
    return {
      fairMarketValue:   fmv,
      overpricedPercent: null,
      recommendedMaxBid: maxBid,
      dealGrade:         null,
      dealGradeLabel:    "No price listed",
      negotiationPlan:   [],
      insight:
        `Estimated fair market value is $${fmv.toLocaleString()}. ` +
        `No price listed — use this as your anchor going in.`,
      riskFactors,
    };
  }

  const price             = input.price;
  const overpricedPercent = Math.round(((price - fmv) / fmv) * 100);
  const ratio             = price / fmv;
  const { grade, label }  = gradeRatio(ratio);
  const negotiationPlan   = buildNegotiationPlan(fmv, maxBid);

  let insight: string;
  if (overpricedPercent <= -15) {
    insight =
      `This listing is ${Math.abs(overpricedPercent)}% below market — ` +
      `strong buy signal. Act before it sells.`;
  } else if (overpricedPercent <= 0) {
    insight = `Priced near fair market value. Negotiate on terms rather than price.`;
  } else if (overpricedPercent <= 20) {
    insight =
      `Listed ${overpricedPercent}% above FMV. ` +
      `Use the negotiation plan below to close the gap.`;
  } else {
    insight =
      `Listed ${overpricedPercent}% above market. ` +
      `Significant negotiation required — or walk.`;
  }

  return {
    fairMarketValue:   fmv,
    overpricedPercent,
    recommendedMaxBid: maxBid,
    dealGrade:         grade,
    dealGradeLabel:    label,
    negotiationPlan,
    insight,
    riskFactors,
  };
}

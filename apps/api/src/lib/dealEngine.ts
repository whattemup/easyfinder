export const ENGINE_VERSION = "1.0.0";

const REPAIR: Record<string, number> = {
  excellent: 0, good: 0.03, fair: 0.08, poor: 0.18, unknown: 0.06,
};

const WEAR: Array<[number, number, number]> = [
  [0, 2000, 0], [2000, 5000, 0.04], [5000, 8000, 0.10],
  [8000, 12000, 0.18], [12000, Infinity, 0.28],
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct = (n: number) => (n * 100).toFixed(1) + "%";

function calcRoi(fair: number, cost: number) {
  return cost <= 0 ? 0 : (fair - cost) / cost;
}

function wearPenalty(hours: number | null, p50: number | null, ask: number) {
  if (hours === null) return 0;
  for (const [lo, hi, p] of WEAR) {
    if (hours >= lo && hours < hi) return p > 0 ? r2((p50 ?? ask) * p) : 0;
  }
  return 0;
}

export interface ListingInput {
  listing_id: string;
  asking_price: number;
  category: string;
  hours?: number | null;
  condition?: string;
  operable?: boolean;
  distance_miles?: number;
  is_auction?: boolean;
  market_p50?: number | null;
  market_p90?: number | null;
  repair_estimate?: number | null;
  resale_value?: number | null;
  project_value?: number | null;
}

export interface DealResult {
  listing_id: string;
  decision: string;
  asking_price: number;
  fair_value: number;
  costs: {
    asking_price: number;
    auction_premium: number;
    auction_online_fee: number;
    transport_cost: number;
    repair_estimate: number;
    wear_penalty: number;
    total_acquisition: number;
  };
  roi_at_ask: number;
  negotiation: any[];
  final_offer: number | null;
  final_roi: number | null;
  rationale: string[];
  flags: string[];
  confidence: number;
  version: string;
}

export function evaluateDeal(raw: ListingInput): DealResult {
  const l = {
    listing_id:     raw.listing_id,
    asking_price:   raw.asking_price,
    category:       raw.category,
    hours:          raw.hours ?? null,
    condition:      (raw.condition ?? "unknown").toLowerCase(),
    operable:       raw.operable !== false,
    distance_miles: raw.distance_miles ?? 0,
    is_auction:     raw.is_auction ?? false,
    market_p50:     raw.market_p50 ?? null,
    market_p90:     raw.market_p90 ?? null,
    repair_estimate: raw.repair_estimate ?? null,
    resale_value:   raw.resale_value ?? null,
    project_value:  raw.project_value ?? null,
  };

  const flags: string[] = [];
  const rat: string[] = [];

  let ap = 0, aof = 0, tr = 0;

  if (l.is_auction) {
    ap = l.asking_price * 0.10;
    aof = 150;
    rat.push(`Auction: +10% buyer premium ($${fmt(ap)}) + $150 fee.`);
  }

  if (l.distance_miles > 0) {
    tr = Math.max(l.distance_miles * 4.5, 350);
    rat.push(`Transport: ${l.distance_miles} mi = $${fmt(tr)}.`);
  }

  let rep: number;
  if (l.repair_estimate !== null) {
    rep = l.repair_estimate;
    rat.push(`Repair (provided): $${fmt(rep)}.`);
  } else {
    const m = REPAIR[l.condition] ?? 0.06;
    rep = l.asking_price * m;
    if (!l.operable) {
      const s = l.asking_price * 0.15;
      rep += s;
      flags.push("NON_OPERABLE");
      rat.push(`Non-operable: +$${fmt(s)} surcharge.`);
    }
    if (l.condition === "unknown") flags.push("UNKNOWN_CONDITION");
    if (rep > 0) rat.push(`Repair '${l.condition}': $${fmt(rep)}.`);
  }

  const wear = wearPenalty(l.hours, l.market_p50, l.asking_price);
  if (wear > 0) rat.push(`Wear penalty: -$${fmt(wear)} off resale.`);

  const total = l.asking_price + ap + aof + tr + rep + wear;

  let fair: number;
  if (l.resale_value !== null) {
    fair = l.resale_value - wear;
    rat.push(`Resale value: $${fmt(l.resale_value)}.`);
  } else if (l.project_value !== null) {
    fair = l.project_value;
    rat.push(`Project value: $${fmt(l.project_value)}.`);
  } else if (l.market_p50 !== null) {
    if (l.market_p90 !== null && l.asking_price > l.market_p90) {
      flags.push("ABOVE_MARKET_P90");
      rat.push(`Overpriced vs p90 ($${fmt(l.market_p90)}).`);
    }
    rat.push(`Fair value base (p50): $${fmt(l.market_p50)}.`);
    fair = Math.max(l.market_p50 - wear - rep * 0.40, l.market_p50 * 0.30);
  } else {
    flags.push("NO_MARKET_DATA");
    rat.push("No market data — using ask proxy.");
    fair = l.asking_price * 0.90;
  }

  const roi = calcRoi(fair, total);

  let decision: string;
  if (!l.operable && roi < 0.20) {
    decision = "WALK";
    rat.push("Non-operable + low ROI → WALK.");
  } else if (flags.includes("ABOVE_MARKET_P90") && roi < 0) {
    decision = "WALK";
    rat.push("Negative ROI → WALK.");
  } else if (roi >= 0.20) {
    decision = "BUY";
    rat.push(`ROI ${pct(roi)} ≥ 20% → BUY.`);
  } else if (roi >= 0.08) {
    decision = "NEGOTIATE";
    rat.push(`ROI ${pct(roi)} in band → NEGOTIATE.`);
  } else {
    decision = "WALK";
    rat.push(`ROI ${pct(roi)} below floor → WALK.`);
  }

  const negotiation: any[] = [];
  const sf = l.asking_price * 0.80;
  let final_offer: number | null = null;
  let final_roi: number | null = null;

  if (decision === "NEGOTIATE") {
    let cur = l.asking_price;
    for (let rnd = 1; rnd <= 3; rnd++) {
      const target = (fair / 1.20) - (ap + aof + tr) - rep;
      let counter = Math.max(Math.round((cur - (cur - target) * 0.40) / 100) * 100, sf);
      const tot2 = counter + (l.is_auction ? counter * 0.10 : 0) + aof + tr + rep + wear;
      const aroi = calcRoi(fair, tot2);
      const accepts = counter >= sf * 0.95;
      const accept = accepts && aroi >= 0.08;
      const rr = `Round ${rnd}: $${fmt(counter)}, ROI ${pct(aroi)}.`;
      rat.push(rr);
      negotiation.push({ round_number: rnd, counter_price: r2(counter), achieved_roi: r4(aroi), accept, rationale: rr });
      if (accept) { final_offer = r2(counter); final_roi = r4(aroi); break; }
      cur = counter;
    }
    if (final_roi !== null && final_roi < 0.05) {
      decision = "WALK";
      rat.push("Negotiation failed → WALK.");
    }
  }

  let conf = 1.0;
  if (l.market_p50 === null)              conf -= 0.25;
  if (l.hours === null)                   conf -= 0.10;
  if (l.condition === "unknown")          conf -= 0.10;
  if (flags.includes("NO_MARKET_DATA"))   conf -= 0.15;
  if (flags.includes("NON_OPERABLE"))     conf -= 0.10;

  return {
    listing_id:   l.listing_id,
    decision,
    asking_price: l.asking_price,
    fair_value:   r2(fair),
    costs: {
      asking_price:       l.asking_price,
      auction_premium:    ap,
      auction_online_fee: aof,
      transport_cost:     tr,
      repair_estimate:    rep,
      wear_penalty:       wear,
      total_acquisition:  r2(total),
    },
    roi_at_ask:   r4(roi),
    negotiation,
    final_offer,
    final_roi,
    rationale:    rat,
    flags,
    confidence:   r2(Math.max(conf, 0.10)),
    version:      ENGINE_VERSION,
  };
}

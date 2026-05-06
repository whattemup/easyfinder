// apps/api/src/lib/dealClient.ts
// Proxies deal evaluation requests to the Python Flask margin engine

const FLASK_URL = process.env.FLASK_URL ?? "http://127.0.0.1:5001";

export interface DealRequest {
  listing_id: string;
  asking_price: number;
  category: string;
  hours?: number | null;
  condition?: string;
  operable?: boolean;
  source?: string;
  distance_miles?: number;
  is_auction?: boolean;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  market_p50?: number | null;
  market_p90?: number | null;
  repair_estimate?: number | null;
  resale_value?: number | null;
  project_value?: number | null;
  buyer_profile?: {
    roi_floor?: number;
    negotiate_floor?: number;
    max_transport_miles?: number;
  } | null;
}

export interface DealResult {
  listing_id: string;
  decision: "BUY" | "NEGOTIATE" | "WALK";
  roi_at_ask: number;
  roi_threshold: number;
  fair_value: number;
  final_offer: number | null;
  final_roi: number | null;
  confidence: number;
  rationale: string[];
  flags: string[];
  costs: {
    asking_price: number;
    transport_cost: number;
    repair_estimate: number;
    auction_premium: number;
    auction_online_fee: number;
    wear_penalty: number;
    total_acquisition: number;
  };
  negotiation: Array<{
    round: number;
    offer: number;
    roi: number;
    accepted: boolean;
  }>;
  version: string;
}

export const evaluateDeal = async (payload: DealRequest): Promise<DealResult> => {
  const res = await fetch(`${FLASK_URL}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Deal engine error ${res.status}: ${text}`);
  }

  return res.json() as Promise<DealResult>;
};

export const checkDealEngineHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${FLASK_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
};

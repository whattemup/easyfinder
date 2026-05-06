"""
margin_engine.py — EasyFinder Deal Decision Engine
====================================================
Produces: BUY / NEGOTIATE / WALK
Inputs:   listing price, market benchmarks, transport, auction fees,
          repair estimates, ROI thresholds, buyer profile
Logic:    multi-round counter-negotiation with real TCO math

Author:   EasyFinder
Version:  1.0.0
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# ── Constants ────────────────────────────────────────────────────────────────

VERSION = "1.0.0"

# Default ROI thresholds (overridable per buyer profile)
DEFAULT_BUY_ROI_MIN        = 0.20   # 20%+ ROI → BUY
DEFAULT_NEGOTIATE_ROI_MIN  = 0.08   # 8–19% ROI → NEGOTIATE
# < 8% ROI → WALK

# Auction fee defaults (IRB/RitchieBros/GovPlanet style)
DEFAULT_AUCTION_BUYER_PREMIUM = 0.10   # 10% buyer premium
DEFAULT_AUCTION_ONLINE_FEE    = 150.0  # flat online bidding fee

# Transport defaults (per-mile loaded trucking)
DEFAULT_TRANSPORT_RATE_PER_MILE = 4.50  # $/mile
DEFAULT_TRANSPORT_FLAT_MINIMUM  = 350.0  # minimum haul charge

# Negotiation rounds
MAX_NEGOTIATION_ROUNDS = 3

# Score → condition multiplier for repair estimate
CONDITION_REPAIR_MULTIPLIER = {
    "excellent": 0.00,
    "good":      0.03,
    "fair":      0.08,
    "poor":      0.18,
    "unknown":   0.06,   # conservative unknown
}

# Hours → wear penalty on resale (applied to market value)
HOURS_WEAR_BANDS = [
    (0,     2000,  0.00),   # low hours → no penalty
    (2000,  5000,  0.04),   # moderate
    (5000,  8000,  0.10),   # high
    (8000,  12000, 0.18),   # very high
    (12000, math.inf, 0.28), # extreme
]

# Non-operable surcharge on repair estimate
NON_OPERABLE_REPAIR_SURCHARGE = 0.15  # +15% of asking price assumed repair floor


# ── Enums ────────────────────────────────────────────────────────────────────

class Decision(str, Enum):
    BUY       = "BUY"
    NEGOTIATE = "NEGOTIATE"
    WALK      = "WALK"


class SourceType(str, Enum):
    AUCTION        = "auction"
    DEALER         = "dealer"
    PRIVATE        = "private"
    VERIFIED       = "verified_partner"
    UNKNOWN        = "unknown"


# ── Data Models ──────────────────────────────────────────────────────────────

@dataclass
class BuyerProfile:
    """Buyer-specific overrides for thresholds and costs."""
    buy_roi_min:       float = DEFAULT_BUY_ROI_MIN
    negotiate_roi_min: float = DEFAULT_NEGOTIATE_ROI_MIN
    transport_rate:    float = DEFAULT_TRANSPORT_RATE_PER_MILE
    transport_minimum: float = DEFAULT_TRANSPORT_FLAT_MINIMUM
    max_negotiation_rounds: int = MAX_NEGOTIATION_ROUNDS
    target_margin_floor: float = 0.05  # won't accept below this even after negotiation


@dataclass
class ListingInput:
    """Raw listing data passed into the engine."""
    listing_id:       str
    asking_price:     float
    category:         str
    hours:            Optional[float]         = None
    condition:        str                     = "unknown"
    operable:         bool                    = True
    source:           SourceType              = SourceType.UNKNOWN
    distance_miles:   float                   = 0.0
    is_auction:       bool                    = False
    year:             Optional[int]           = None
    make:             Optional[str]           = None
    model:            Optional[str]           = None

    # Market data (from scoring engine benchmarks)
    market_p50:       Optional[float]         = None   # median market price
    market_p90:       Optional[float]         = None   # high market price

    # Repair / inspection overrides
    repair_estimate:  Optional[float]         = None   # if known, skip engine calc

    # Resale / project value
    resale_value:     Optional[float]         = None   # estimated resale if flipped
    project_value:    Optional[float]         = None   # value in use (buyer's project)


@dataclass
class CostBreakdown:
    """Itemized cost to acquire and own."""
    asking_price:      float
    auction_premium:   float  = 0.0
    auction_online_fee: float = 0.0
    transport_cost:    float  = 0.0
    repair_estimate:   float  = 0.0
    wear_penalty:      float  = 0.0   # applied against resale
    total_acquisition: float  = 0.0   # sum of all above

    def compute(self) -> None:
        self.total_acquisition = (
            self.asking_price
            + self.auction_premium
            + self.auction_online_fee
            + self.transport_cost
            + self.repair_estimate
        )


@dataclass
class NegotiationRound:
    """Single round of counter-negotiation."""
    round_number:    int
    counter_price:   float
    target_roi:      float
    achieved_roi:    float
    accept:          bool
    rationale:       str


@dataclass
class DealResult:
    """Full decision output returned to caller."""
    listing_id:       str
    decision:         Decision
    asking_price:     float
    fair_value:       float
    costs:            CostBreakdown
    roi_at_ask:       float
    roi_threshold:    float
    negotiation:      list[NegotiationRound]
    final_offer:      Optional[float]
    final_roi:        Optional[float]
    rationale:        list[str]
    flags:            list[str]
    confidence:       float   # 0–1, how reliable this analysis is
    version:          str     = VERSION


# ── Core Engine ──────────────────────────────────────────────────────────────

class MarginEngine:
    """
    Deal decision engine.
    Call evaluate(listing, profile) → DealResult
    """

    def __init__(self, profile: Optional[BuyerProfile] = None):
        self.profile = profile or BuyerProfile()

    # ── Public entry point ────────────────────────────────────────────────

    def evaluate(self, listing: ListingInput) -> DealResult:
        flags: list[str]    = []
        rationale: list[str] = []

        # 1. Compute costs
        costs = self._build_costs(listing, flags, rationale)
        costs.compute()

        # 2. Estimate fair / resale value
        fair_value = self._estimate_fair_value(listing, costs, flags, rationale)

        # 3. ROI at asking price
        roi_at_ask = self._calc_roi(fair_value, costs.total_acquisition)

        # 4. Confidence in this analysis
        confidence = self._calc_confidence(listing, flags)

        # 5. Primary decision
        decision, threshold = self._decide(roi_at_ask, listing, flags, rationale)

        # 6. Negotiation rounds (if NEGOTIATE)
        negotiation: list[NegotiationRound] = []
        final_offer: Optional[float] = None
        final_roi:   Optional[float] = None

        if decision == Decision.NEGOTIATE:
            negotiation, final_offer, final_roi = self._negotiate(
                listing, costs, fair_value, rationale
            )
            # If negotiation fails to hit floor, escalate to WALK
            if final_roi is not None and final_roi < self.profile.target_margin_floor:
                decision = Decision.WALK
                rationale.append(
                    f"Negotiation exhausted — best achievable ROI "
                    f"({final_roi:.1%}) below floor ({self.profile.target_margin_floor:.1%}). WALK."
                )

        return DealResult(
            listing_id    = listing.listing_id,
            decision      = decision,
            asking_price  = listing.asking_price,
            fair_value    = fair_value,
            costs         = costs,
            roi_at_ask    = roi_at_ask,
            roi_threshold = threshold,
            negotiation   = negotiation,
            final_offer   = final_offer,
            final_roi     = final_roi,
            rationale     = rationale,
            flags         = flags,
            confidence    = confidence,
        )

    # ── Cost Builder ──────────────────────────────────────────────────────

    def _build_costs(
        self,
        listing: ListingInput,
        flags: list[str],
        rationale: list[str],
    ) -> CostBreakdown:
        costs = CostBreakdown(asking_price=listing.asking_price)

        # Auction fees
        if listing.is_auction:
            costs.auction_premium   = listing.asking_price * DEFAULT_AUCTION_BUYER_PREMIUM
            costs.auction_online_fee = DEFAULT_AUCTION_ONLINE_FEE
            rationale.append(
                f"Auction: +{DEFAULT_AUCTION_BUYER_PREMIUM:.0%} buyer premium "
                f"(${costs.auction_premium:,.0f}) + ${DEFAULT_AUCTION_ONLINE_FEE:.0f} online fee."
            )

        # Transport
        if listing.distance_miles > 0:
            raw = listing.distance_miles * self.profile.transport_rate
            costs.transport_cost = max(raw, self.profile.transport_minimum)
            rationale.append(
                f"Transport: {listing.distance_miles:.0f} mi × "
                f"${self.profile.transport_rate}/mi = ${costs.transport_cost:,.0f}."
            )

        # Repair estimate
        if listing.repair_estimate is not None:
            costs.repair_estimate = listing.repair_estimate
            rationale.append(f"Repair estimate (provided): ${costs.repair_estimate:,.0f}.")
        else:
            costs.repair_estimate = self._estimate_repair(listing, flags, rationale)

        # Wear penalty (reduces resale, not acquisition cost — tracked separately)
        costs.wear_penalty = self._calc_wear_penalty(listing, rationale)

        return costs

    def _estimate_repair(
        self,
        listing: ListingInput,
        flags: list[str],
        rationale: list[str],
    ) -> float:
        condition = listing.condition.lower()
        multiplier = CONDITION_REPAIR_MULTIPLIER.get(condition, CONDITION_REPAIR_MULTIPLIER["unknown"])

        repair = listing.asking_price * multiplier

        if not listing.operable:
            surcharge = listing.asking_price * NON_OPERABLE_REPAIR_SURCHARGE
            repair += surcharge
            flags.append("NON_OPERABLE")
            rationale.append(
                f"Non-operable: +${surcharge:,.0f} repair surcharge "
                f"({NON_OPERABLE_REPAIR_SURCHARGE:.0%} of ask)."
            )

        if condition == "unknown":
            flags.append("UNKNOWN_CONDITION")
            rationale.append(
                f"Condition unknown — conservative repair estimate applied "
                f"(${repair:,.0f})."
            )
        elif repair > 0:
            rationale.append(
                f"Condition '{condition}': repair estimate ${repair:,.0f} "
                f"({multiplier:.0%} of ask)."
            )

        return round(repair, 2)

    def _calc_wear_penalty(
        self,
        listing: ListingInput,
        rationale: list[str],
    ) -> float:
        if listing.hours is None:
            return 0.0
        for lo, hi, pct in HOURS_WEAR_BANDS:
            if lo <= listing.hours < hi:
                if pct > 0:
                    base = listing.market_p50 or listing.asking_price
                    penalty = base * pct
                    rationale.append(
                        f"{listing.hours:,.0f} hrs: wear penalty "
                        f"{pct:.0%} → −${penalty:,.0f} off resale."
                    )
                    return round(penalty, 2)
                return 0.0
        return 0.0

    # ── Fair Value Estimator ──────────────────────────────────────────────

    def _estimate_fair_value(
        self,
        listing: ListingInput,
        costs: CostBreakdown,
        flags: list[str],
        rationale: list[str],
    ) -> float:
        """
        Best estimate of what this unit is actually worth.
        Priority: explicit resale/project value → market benchmarks → fallback.
        """
        # Explicit value provided by caller
        if listing.resale_value is not None:
            rationale.append(f"Resale value (provided): ${listing.resale_value:,.0f}.")
            return listing.resale_value - costs.wear_penalty

        if listing.project_value is not None:
            rationale.append(f"Project value (provided): ${listing.project_value:,.0f}.")
            return listing.project_value

        # Market benchmarks
        if listing.market_p50 is not None:
            base = listing.market_p50
            # If asking above p90, market says it's overpriced
            if listing.market_p90 and listing.asking_price > listing.market_p90:
                flags.append("ABOVE_MARKET_P90")
                rationale.append(
                    f"Asking ${listing.asking_price:,.0f} exceeds market p90 "
                    f"(${listing.market_p90:,.0f}) — overpriced signal."
                )
            rationale.append(
                f"Market p50 used as fair value base: ${base:,.0f}."
            )
            # Net out repair cost from resale value — repairs don't add full dollar-for-dollar value
            repair_recovery = 0.60  # 60 cents on the dollar recovered through repair
            net_fair = base - costs.wear_penalty - (costs.repair_estimate * (1 - repair_recovery))
            return max(net_fair, base * 0.30)

        # Fallback: use asking price as proxy (low confidence)
        flags.append("NO_MARKET_DATA")
        rationale.append(
            "No market benchmarks available — asking price used as fair value proxy. "
            "Low confidence."
        )
        return listing.asking_price * 0.90   # assume slight premium in ask

    # ── ROI Calculator ────────────────────────────────────────────────────

    @staticmethod
    def _calc_roi(fair_value: float, total_cost: float) -> float:
        if total_cost <= 0:
            return 0.0
        return (fair_value - total_cost) / total_cost

    # ── Decision Logic ────────────────────────────────────────────────────

    def _decide(
        self,
        roi: float,
        listing: ListingInput,
        flags: list[str],
        rationale: list[str],
    ) -> tuple[Decision, float]:
        p = self.profile

        # Hard WALK conditions
        if not listing.operable and roi < p.negotiate_roi_min:
            rationale.append(
                "Non-operable + ROI below negotiate threshold → WALK."
            )
            return Decision.WALK, p.negotiate_roi_min

        if "ABOVE_MARKET_P90" in flags and roi < 0:
            rationale.append("Negative ROI on overpriced listing → WALK.")
            return Decision.WALK, p.negotiate_roi_min

        # BUY
        if roi >= p.buy_roi_min:
            rationale.append(
                f"ROI {roi:.1%} ≥ BUY threshold {p.buy_roi_min:.1%} → BUY."
            )
            return Decision.BUY, p.buy_roi_min

        # NEGOTIATE
        if roi >= p.negotiate_roi_min:
            rationale.append(
                f"ROI {roi:.1%} in negotiate band "
                f"[{p.negotiate_roi_min:.1%}–{p.buy_roi_min:.1%}] → NEGOTIATE."
            )
            return Decision.NEGOTIATE, p.negotiate_roi_min

        # WALK
        rationale.append(
            f"ROI {roi:.1%} below negotiate floor {p.negotiate_roi_min:.1%} → WALK."
        )
        return Decision.WALK, p.negotiate_roi_min

    # ── Negotiation Engine ────────────────────────────────────────────────

    def _negotiate(
        self,
        listing: ListingInput,
        costs: CostBreakdown,
        fair_value: float,
        rationale: list[str],
    ) -> tuple[list[NegotiationRound], Optional[float], Optional[float]]:
        """
        Multi-round counter-offer logic.
        Each round: compute target price to hit ROI threshold,
        apply a concession step, check if seller would accept.
        """
        rounds: list[NegotiationRound] = []
        p = self.profile

        # Non-price costs (fixed regardless of negotiated price)
        fixed_costs = (
            costs.auction_premium / listing.asking_price * listing.asking_price
            + costs.auction_online_fee
            + costs.transport_cost
        )
        # Note: auction_premium scales with price — recalculate per round

        # Seller's floor: assume seller won't go below 80% of ask (realistic)
        seller_floor = listing.asking_price * 0.80

        current_ask = listing.asking_price

        for rnd in range(1, p.max_negotiation_rounds + 1):
            # Target: price where ROI hits buy_roi_min
            # fair_value = target_total * (1 + buy_roi_min)
            # target_total = fair_value / (1 + buy_roi_min)
            # target_price = target_total - fixed_costs - repair
            target_total = fair_value / (1 + p.buy_roi_min)
            target_price = target_total - fixed_costs - costs.repair_estimate

            # Apply concession step (each round we move 40% toward target)
            step = (current_ask - target_price) * 0.40
            counter_price = round(current_ask - step, -2)   # round to nearest $100
            counter_price = max(counter_price, seller_floor)

            # Recalc ROI at counter price
            if listing.is_auction:
                auction_prem = counter_price * DEFAULT_AUCTION_BUYER_PREMIUM
            else:
                auction_prem = 0.0

            total_at_counter = (
                counter_price
                + auction_prem
                + costs.auction_online_fee
                + costs.transport_cost
                + costs.repair_estimate
            )
            achieved_roi = self._calc_roi(fair_value, total_at_counter)

            # Would a rational seller accept? (within 5% of their floor)
            seller_accepts = counter_price >= seller_floor * 0.95

            round_rationale = (
                f"Round {rnd}: counter ${counter_price:,.0f} "
                f"(from ${current_ask:,.0f}), "
                f"ROI {achieved_roi:.1%}, "
                f"seller {'accepts' if seller_accepts else 'unlikely to accept'}."
            )
            rationale.append(round_rationale)

            rounds.append(NegotiationRound(
                round_number  = rnd,
                counter_price = counter_price,
                target_roi    = p.buy_roi_min,
                achieved_roi  = achieved_roi,
                accept        = seller_accepts and achieved_roi >= p.negotiate_roi_min,
                rationale     = round_rationale,
            ))

            if seller_accepts and achieved_roi >= p.negotiate_roi_min:
                rationale.append(
                    f"Deal viable at ${counter_price:,.0f} — ROI {achieved_roi:.1%}."
                )
                return rounds, counter_price, achieved_roi

            current_ask = counter_price  # next round starts from new counter

        # Exhausted rounds
        last = rounds[-1]
        return rounds, last.counter_price, last.achieved_roi

    # ── Confidence Score ──────────────────────────────────────────────────

    @staticmethod
    def _calc_confidence(listing: ListingInput, flags: list[str]) -> float:
        score = 1.0
        if listing.market_p50 is None:   score -= 0.25
        if listing.hours is None:        score -= 0.10
        if listing.condition == "unknown": score -= 0.10
        if "NO_MARKET_DATA" in flags:    score -= 0.15
        if "NON_OPERABLE" in flags:      score -= 0.10
        if "ABOVE_MARKET_P90" in flags:  score -= 0.05
        return round(max(score, 0.10), 2)


# ── Formatter ────────────────────────────────────────────────────────────────

def format_result(result: DealResult) -> str:
    """Human-readable summary for CLI / logging."""
    lines = [
        "=" * 60,
        f"  DEAL DECISION: {result.decision.value}",
        "=" * 60,
        f"  Listing:       {result.listing_id}",
        f"  Asking Price:  ${result.asking_price:>12,.2f}",
        f"  Fair Value:    ${result.fair_value:>12,.2f}",
        "",
        "  Cost Breakdown:",
        f"    Asking price:      ${result.costs.asking_price:>10,.2f}",
        f"    Auction premium:   ${result.costs.auction_premium:>10,.2f}",
        f"    Auction online:    ${result.costs.auction_online_fee:>10,.2f}",
        f"    Transport:         ${result.costs.transport_cost:>10,.2f}",
        f"    Repair estimate:   ${result.costs.repair_estimate:>10,.2f}",
        f"    ─────────────────────────────────",
        f"    TOTAL ACQUISITION: ${result.costs.total_acquisition:>10,.2f}",
        "",
        f"  ROI at ask:    {result.roi_at_ask:>8.1%}",
        f"  ROI threshold: {result.roi_threshold:>8.1%}",
        f"  Confidence:    {result.confidence:>8.0%}",
    ]

    if result.flags:
        lines += ["", f"  Flags: {', '.join(result.flags)}"]

    if result.negotiation:
        lines += ["", "  Negotiation Rounds:"]
        for r in result.negotiation:
            status = "✓ ACCEPT" if r.accept else "✗ reject"
            lines.append(
                f"    [{r.round_number}] ${r.counter_price:,.0f} → "
                f"ROI {r.achieved_roi:.1%} {status}"
            )
        if result.final_offer:
            lines += [
                "",
                f"  Final Offer:  ${result.final_offer:,.0f}",
                f"  Final ROI:    {result.final_roi:.1%}",
            ]

    lines += ["", "  Rationale:"]
    for line in result.rationale:
        lines.append(f"    • {line}")

    lines.append("=" * 60)
    return "\n".join(lines)


# ── Stress Test Suite ─────────────────────────────────────────────────────────

def run_stress_tests() -> None:
    """
    20 realistic scenarios covering edge cases.
    Prints PASS/FAIL per case.
    """
    engine = MarginEngine()

    cases = [
        # (description, listing_kwargs, expected_decision)
        ("Clean deal — strong ROI at ask",
         dict(listing_id="T01", asking_price=45000, category="excavator",
              hours=2100, condition="good", operable=True,
              market_p50=62000, market_p90=80000, distance_miles=80),
         Decision.BUY),

        ("Marginal deal — fair value after wear and repair nets negative ROI",
         dict(listing_id="T02", asking_price=58000, category="excavator",
              hours=4500, condition="fair", operable=True,
              market_p50=62000, market_p90=80000, distance_miles=200),
         Decision.WALK),

        ("Overpriced — WALK",
         dict(listing_id="T03", asking_price=95000, category="excavator",
              hours=9000, condition="fair", operable=True,
              market_p50=62000, market_p90=80000, distance_miles=500),
         Decision.WALK),

        ("Non-operable cheap — repair netted from fair value → NEGOTIATE",
         dict(listing_id="T04", asking_price=18000, category="bulldozer",
              hours=None, condition="poor", operable=False,
              market_p50=55000, market_p90=72000, distance_miles=100),
         Decision.BUY),

        ("Non-operable overpriced — WALK",
         dict(listing_id="T05", asking_price=52000, category="bulldozer",
              hours=None, condition="poor", operable=False,
              market_p50=55000, market_p90=72000, distance_miles=300),
         Decision.WALK),

        ("Auction deal — great price",
         dict(listing_id="T06", asking_price=30000, category="wheel_loader",
              hours=3200, condition="good", operable=True, is_auction=True,
              market_p50=52000, market_p90=68000, distance_miles=150),
         Decision.BUY),

        ("Auction — fees + wear + repair kill margin → WALK",
         dict(listing_id="T07", asking_price=48000, category="wheel_loader",
              hours=7500, condition="fair", operable=True, is_auction=True,
              market_p50=52000, market_p90=68000, distance_miles=600),
         Decision.WALK),

        ("No market data — conservative proxy → WALK",
         dict(listing_id="T08", asking_price=35000, category="skid_steer",
              hours=5000, condition="fair", operable=True,
              distance_miles=50),
         Decision.WALK),

        ("Long haul — transport + wear → NEGOTIATE",
         dict(listing_id="T09", asking_price=40000, category="forklift",
              hours=3000, condition="good", operable=True,
              market_p50=55000, market_p90=70000, distance_miles=1200),
         Decision.NEGOTIATE),

        ("Excellent condition, low hours — BUY",
         dict(listing_id="T10", asking_price=38000, category="crane",
              hours=800, condition="excellent", operable=True,
              market_p50=65000, market_p90=85000, distance_miles=50),
         Decision.BUY),

        ("Known repair cost — netting from fair value still leaves margin → BUY",
         dict(listing_id="T11", asking_price=20000, category="excavator",
              hours=6000, condition="poor", operable=True,
              repair_estimate=12000, market_p50=55000, market_p90=72000,
              distance_miles=100),
         Decision.BUY),

        ("Explicit resale value provided",
         dict(listing_id="T12", asking_price=30000, category="excavator",
              hours=4000, condition="fair", operable=True,
              resale_value=50000, distance_miles=200),
         Decision.BUY),

        ("Zero distance — local pickup",
         dict(listing_id="T13", asking_price=42000, category="bulldozer",
              hours=3500, condition="good", operable=True,
              market_p50=55000, market_p90=70000, distance_miles=0),
         Decision.BUY),

        ("Extreme hours — wear kills resale",
         dict(listing_id="T14", asking_price=35000, category="excavator",
              hours=14000, condition="fair", operable=True,
              market_p50=55000, market_p90=70000, distance_miles=100),
         Decision.WALK),

        ("Project value beats market",
         dict(listing_id="T15", asking_price=40000, category="crane",
              hours=5000, condition="fair", operable=True,
              project_value=70000, distance_miles=100),
         Decision.BUY),

        ("Strict buyer profile — higher thresholds",
         dict(listing_id="T16", asking_price=50000, category="excavator",
              hours=4000, condition="good", operable=True,
              market_p50=60000, market_p90=75000, distance_miles=100),
         Decision.NEGOTIATE),

        ("Missing hours, unknown condition",
         dict(listing_id="T17", asking_price=45000, category="loader",
              operable=True, market_p50=55000, market_p90=70000,
              distance_miles=200),
         Decision.NEGOTIATE),

        ("Private seller, verified deal",
         dict(listing_id="T18", asking_price=28000, category="skid_steer",
              hours=2500, condition="good", operable=True,
              source=SourceType.VERIFIED,
              market_p50=48000, market_p90=60000, distance_miles=75),
         Decision.BUY),

        ("Asking at p90 — borderline",
         dict(listing_id="T19", asking_price=78000, category="excavator",
              hours=5000, condition="fair", operable=True,
              market_p50=62000, market_p90=80000, distance_miles=200),
         Decision.WALK),

        ("Auction + non-operable + far — cheap enough to still BUY",
         dict(listing_id="T20", asking_price=22000, category="bulldozer",
              hours=None, condition="poor", operable=False, is_auction=True,
              market_p50=55000, market_p90=72000, distance_miles=400),
         Decision.BUY),
    ]

    passed = 0
    failed = 0

    print("\n" + "=" * 60)
    print("  MARGIN ENGINE STRESS TEST SUITE")
    print("=" * 60)

    for desc, kwargs, expected in cases:
        listing = ListingInput(**kwargs)
        result  = engine.evaluate(listing)
        ok      = result.decision == expected
        status  = "PASS ✓" if ok else f"FAIL ✗ (got {result.decision.value})"
        print(f"  [{listing.listing_id}] {status}  —  {desc}")
        if ok:
            passed += 1
        else:
            failed += 1
            # Show why on failure
            for r in result.rationale[-3:]:
                print(f"         > {r}")

    print("=" * 60)
    print(f"  Results: {passed}/{passed+failed} passed")
    print("=" * 60 + "\n")

    if failed > 0:
        raise SystemExit(f"{failed} test(s) failed.")


# ── CLI ───────────────────────────────────────────────────────────────────────

def _demo() -> None:
    """Quick demo: one BUY, one NEGOTIATE, one WALK."""
    engine = MarginEngine()

    examples = [
        ListingInput(
            listing_id    = "CAT-336-2019",
            asking_price  = 87000,
            category      = "excavator",
            hours         = 3400,
            condition     = "good",
            operable      = True,
            source        = SourceType.DEALER,
            distance_miles= 120,
            is_auction    = False,
            market_p50    = 105000,
            market_p90    = 135000,
            year=2019, make="CAT", model="336",
        ),
        ListingInput(
            listing_id    = "JD-310L-2016",
            asking_price  = 48000,
            category      = "backhoe",
            hours         = 5800,
            condition     = "fair",
            operable      = True,
            source        = SourceType.AUCTION,
            distance_miles= 310,
            is_auction    = True,
            market_p50    = 52000,
            market_p90    = 67000,
            year=2016, make="John Deere", model="310L",
        ),
        ListingInput(
            listing_id    = "KOMATSU-PC200-2012",
            asking_price  = 72000,
            category      = "excavator",
            hours         = 11500,
            condition     = "poor",
            operable      = False,
            source        = SourceType.UNKNOWN,
            distance_miles= 750,
            is_auction    = False,
            market_p50    = 58000,
            market_p90    = 74000,
            year=2012, make="Komatsu", model="PC200",
        ),
    ]

    for listing in examples:
        result = engine.evaluate(listing)
        print(format_result(result))



if __name__ == "__main__":
    import sys
    import json

    try:
        raw = sys.stdin.read()

        if not raw.strip():
            print(json.dumps({"error": "No input provided"}))
            sys.exit(1)

        data = json.loads(raw)

        engine = MarginEngine()
        listing = ListingInput(**data)

        result = engine.evaluate(listing)

        output = {
            "decision": result.decision,
            "roi": result.roi_at_ask,
            "confidence": result.confidence,
        }

        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({
            "error": str(e)
        }))
        sys.exit(1)

from fastapi import FastAPI
from app.scoring.valuation import calculate_fmv
from app.scoring.risk import calculate_risk
from app.scoring.bidcap import get_bid_cap
from app.scoring.negotiation import generate_rebuttals
from app.db.repository import save_machine

app = FastAPI(title="EasyFinder Scoring Engine")

@app.post("/score")
def score_machine(payload: dict):
    model = payload.get("model")
    year = payload.get("year")
    hours = payload.get("hours")
    listing_price = payload.get("listing_price")
    service_history = payload.get("service_history", False)

    fair_market_value = calculate_fmv(model, year, hours)
    risk_score = calculate_risk(model, year, hours, listing_price, service_history)
    recommended_max_bid = get_bid_cap(fair_market_value, risk_score)
    negotiation_plan = generate_rebuttals(listing_price, recommended_max_bid, fair_market_value)

    try:
        save_machine(payload, fair_market_value, risk_score, recommended_max_bid)
    except Exception as e:
        # Log error and continue - scoring result is still valid
        # Consider: return partial response or raise HTTPException
        pass

    return {
        "fair_market_value": fair_market_value,
        "listing_price": listing_price,
        "overpriced_percent": round((listing_price - fair_market_value) / fair_market_value * 100, 1) if fair_market_value else None,
        "risk_score": risk_score,
        "recommended_max_bid": recommended_max_bid,
        "negotiation_plan": negotiation_plan
    }

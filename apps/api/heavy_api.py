"""heavy_api.py — REST wrapper for margin_engine.py"""
from flask import Flask, request, jsonify
from dataclasses import asdict
from margin_engine import MarginEngine, ListingInput, BuyerProfile, SourceType

app = Flask(__name__)
engine = MarginEngine()

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "1.0.0"})

@app.route("/evaluate", methods=["POST"])
def evaluate():
    try:
        d = request.get_json(force=True)
        try:
            source = SourceType(d.get("source", "unknown"))
        except ValueError:
            source = SourceType.UNKNOWN
        profile_data = d.get("buyer_profile")
        profile = BuyerProfile(**profile_data) if profile_data else None
        listing = ListingInput(
            listing_id     = str(d.get("listing_id", "unknown")),
            asking_price   = float(d["asking_price"]),
            category       = str(d.get("category", "unknown")),
            hours          = float(d["hours"]) if d.get("hours") is not None else None,
            condition      = str(d.get("condition", "unknown")),
            operable       = bool(d.get("operable", True)),
            source         = source,
            distance_miles = float(d.get("distance_miles", 0)),
            is_auction     = bool(d.get("is_auction", False)),
            year           = int(d["year"]) if d.get("year") else None,
            make           = d.get("make"),
            model          = d.get("model"),
            market_p50     = float(d["market_p50"]) if d.get("market_p50") else None,
            market_p90     = float(d["market_p90"]) if d.get("market_p90") else None,
            repair_estimate= float(d["repair_estimate"]) if d.get("repair_estimate") else None,
            resale_value   = float(d["resale_value"]) if d.get("resale_value") else None,
            project_value  = float(d["project_value"]) if d.get("project_value") else None,
        )
        result = engine.evaluate(listing)
        out = asdict(result)
        out["decision"] = result.decision.value
        return jsonify(out)
    except KeyError as e:
        return jsonify({"error": f"Missing required field: {e}"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False)

def get_bid_cap(fmv, risk_score):
    cap_factor = 1 - (risk_score / 100) * 0.1
    return round(fmv * cap_factor, 0)

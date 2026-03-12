def calculate_risk(model, year, hours, listing_price, service_history):
    risk = 0
    if hours > 8000:
        risk += 20
    if year < 2015:
        risk += 15
    if not service_history:
        risk += 25
    if listing_price > 1.2 * 71400:
        risk += 20
    return min(risk, 100)

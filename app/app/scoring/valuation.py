import pandas as pd

DATA_PATH = "data/sold_comps.csv"

def calculate_fmv(model: str, year: int, hours: int) -> float:
    df = pd.read_csv(DATA_PATH)
    comps = df[df["model"] == model]
    if comps.empty:
        return 0

    avg_price = comps["price"].mean()
    avg_hours = comps["hours"].mean()
    adjustment = (avg_hours - hours) * 0.5
    age_factor = (2026 - year) * 500
    fmv = avg_price - adjustment - age_factor
    return round(fmv, 0)

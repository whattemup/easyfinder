def generate_rebuttals(listing_price, max_bid, fmv):
    return [
        f"Initial offer: {int(max_bid*0.95)}",
        f"Rebuttal 1: {int(max_bid*0.97)}",
        f"Rebuttal 2: {int(max_bid)}",
    ]

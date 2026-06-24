from .database import get_connection

def save_machine(payload, fmv, risk_score, max_bid):
    conn = get_connection()
    cur = None
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS machines (
                id SERIAL PRIMARY KEY,
                model TEXT,
                year INT,
                hours INT,
                listing_price FLOAT,
                service_history BOOLEAN,
                fmv FLOAT,
                risk_score INT,
                max_bid FLOAT
            )
        """)
        cur.execute("""
            INSERT INTO machines (model, year, hours, listing_price, service_history, fmv, risk_score, max_bid)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """, (payload["model"], payload["year"], payload["hours"], payload["listing_price"], payload["service_history"], fmv, risk_score, max_bid))
        conn.commit()
    finally:
        if cur is not None:
            cur.close()
        conn.close()

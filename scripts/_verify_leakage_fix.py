"""Verify Step 02 lagged columns. Spot-check one product."""
from config.db import engine
from sqlalchemy import text


def main():
    with engine.connect() as c:
        max_date = c.execute(text("SELECT MAX(date) FROM derived.product_daily_features")).scalar()
        print(f"latest date in features: {max_date}\n")
        pid = c.execute(text("""
            SELECT product_id
            FROM derived.product_daily_features
            WHERE last_7_day_avg IS DISTINCT FROM last_7_day_avg_lagged
              AND quantity_sold > 0
            ORDER BY date DESC, quantity_sold DESC
            LIMIT 1
        """)).scalar()
        print(f"product: {pid}\n")
        print(f"{'date':<12} {'qty':>5} {'avg7':>10} {'avg7_lag':>10} {'avg30':>10} {'avg30_lag':>10}")
        print("-" * 64)
        rows = c.execute(text("""
            SELECT date, quantity_sold,
                   ROUND(last_7_day_avg::numeric, 2)         AS avg7,
                   ROUND(last_7_day_avg_lagged::numeric, 2)  AS avg7_lag,
                   ROUND(last_30_day_avg::numeric, 2)        AS avg30,
                   ROUND(last_30_day_avg_lagged::numeric, 2) AS avg30_lag
            FROM derived.product_daily_features
            WHERE product_id = :p
            ORDER BY date DESC
            LIMIT 10
        """), {"p": pid}).all()
        for r in rows:
            print(f"{str(r.date):<12} {r.quantity_sold:>5} {str(r.avg7):>10} {str(r.avg7_lag):>10} {str(r.avg30):>10} {str(r.avg30_lag):>10}")


if __name__ == "__main__":
    main()

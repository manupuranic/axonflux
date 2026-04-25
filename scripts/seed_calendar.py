"""
Seed derived.calendar_dim with date metadata + Indian retail festivals.

Run once after initial setup, then annually to extend the date range:
    PYTHONPATH=. python scripts/seed_calendar.py

Creates the table if it doesn't exist. Idempotent — uses ON CONFLICT DO UPDATE.
Requires `holidays` package: pip install holidays
"""

import sys
from datetime import date, timedelta

import holidays as holidays_lib
import pandas as pd
from sqlalchemy import text

from config.db import engine

# ---------------------------------------------------------------------------
# Festival definitions
# peaks: list of festival peak dates (string YYYY-MM-DD)
# pre:   days BEFORE peak included in festival window
# post:  days AFTER  peak included in festival window
# ---------------------------------------------------------------------------
RETAIL_FESTIVALS: dict[str, dict] = {
    "New Year": {
        "peaks": ["2024-01-01", "2025-01-01", "2026-01-01", "2027-01-01", "2028-01-01"],
        "pre": 2, "post": 1,
    },
    "Pongal": {
        "peaks": ["2024-01-15", "2025-01-14", "2026-01-14", "2027-01-14", "2028-01-15"],
        "pre": 2, "post": 1,
    },
    "Holi": {
        "peaks": ["2024-03-25", "2025-03-14", "2026-03-03", "2027-03-22", "2028-03-11"],
        "pre": 3, "post": 2,
    },
    "Eid ul-Fitr": {
        "peaks": ["2024-04-10", "2025-03-31", "2026-03-20", "2027-03-09", "2028-02-27"],
        "pre": 2, "post": 1,
    },
    "Eid ul-Adha": {
        "peaks": ["2024-06-17", "2025-06-07", "2026-05-27", "2027-05-16", "2028-05-05"],
        "pre": 2, "post": 1,
    },
    "Ganesh Chaturthi": {
        "peaks": ["2024-09-07", "2025-08-27", "2026-09-15", "2027-09-04", "2028-08-23"],
        "pre": 3, "post": 2,
    },
    "Onam": {
        "peaks": ["2024-09-15", "2025-09-05", "2026-08-25", "2027-09-13", "2028-09-01"],
        "pre": 3, "post": 2,
    },
    # Navratri starts ~9 days before Dussehra; treat as one extended window
    "Navratri-Dussehra": {
        "peaks": ["2024-10-12", "2025-10-02", "2026-10-21", "2027-10-10", "2028-09-28"],
        "pre": 9, "post": 2,
    },
    "Dhanteras": {
        "peaks": ["2024-10-29", "2025-10-18", "2026-11-05", "2027-10-26", "2028-10-14"],
        "pre": 3, "post": 1,
    },
    "Diwali": {
        "peaks": ["2024-10-31", "2025-10-20", "2026-11-07", "2027-10-27", "2028-10-15"],
        "pre": 5, "post": 3,
    },
    "Christmas": {
        "peaks": ["2024-12-25", "2025-12-25", "2026-12-25", "2027-12-25", "2028-12-25"],
        "pre": 3, "post": 1,
    },
}

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS derived.calendar_dim (
    date                     DATE     PRIMARY KEY,
    dow                      INTEGER  NOT NULL,  -- 0=Sunday, 6=Saturday (PostgreSQL DOW)
    is_weekend               BOOLEAN  NOT NULL,
    month                    INTEGER  NOT NULL,
    quarter                  INTEGER  NOT NULL,
    week_of_year             INTEGER  NOT NULL,
    is_holiday               BOOLEAN  NOT NULL  DEFAULT FALSE,
    holiday_name             TEXT,
    is_festival_window       BOOLEAN  NOT NULL  DEFAULT FALSE,
    festival_name            TEXT,
    days_to_next_festival    INTEGER,
    days_since_last_festival INTEGER
);
"""


def parse_peaks(festival_dict: dict) -> list[tuple[date, str]]:
    """Flatten RETAIL_FESTIVALS into sorted list of (peak_date, festival_name)."""
    peaks = []
    for name, cfg in festival_dict.items():
        for peak_str in cfg["peaks"]:
            peaks.append((date.fromisoformat(peak_str), name))
    return sorted(peaks, key=lambda x: x[0])


def build_calendar(start: date, end: date) -> pd.DataFrame:
    india_holidays = {}
    for yr in range(start.year, end.year + 1):
        india_holidays.update(holidays_lib.country_holidays("IN", years=yr))

    all_peaks = parse_peaks(RETAIL_FESTIVALS)
    peak_dates = [p[0] for p in all_peaks]  # sorted ascending

    # Build festival window lookup: date -> festival_name
    festival_window_map: dict[date, str] = {}
    for fest_name, cfg in RETAIL_FESTIVALS.items():
        pre, post = cfg["pre"], cfg["post"]
        for peak_str in cfg["peaks"]:
            peak = date.fromisoformat(peak_str)
            for offset in range(-pre, post + 1):
                d = peak + timedelta(days=offset)
                if d not in festival_window_map:  # first match wins (closest peak)
                    festival_window_map[d] = fest_name

    rows = []
    date_range = [start + timedelta(days=i) for i in range((end - start).days + 1)]

    for d in date_range:
        # Official holiday check
        h_name = india_holidays.get(d)
        is_holiday = h_name is not None

        # Festival window
        fest_name = festival_window_map.get(d)
        is_festival_window = fest_name is not None

        # If it's a festival window day, mark as holiday too
        if is_festival_window and not is_holiday:
            is_holiday = True
            h_name = fest_name

        # days_to_next_festival: min (peak - d).days where peak >= d
        future = [p for p in peak_dates if p >= d]
        days_to_next = (future[0] - d).days if future else None

        # days_since_last_festival: min (d - peak).days where peak <= d
        past = [p for p in peak_dates if p <= d]
        days_since_last = (d - past[-1]).days if past else None

        # PostgreSQL EXTRACT(DOW): 0=Sunday, 6=Saturday
        pg_dow = d.isoweekday() % 7  # Mon=1..Sun=0 → 0=Sun,1=Mon,..,6=Sat

        rows.append({
            "date": d,
            "dow": pg_dow,
            "is_weekend": pg_dow in (0, 6),
            "month": d.month,
            "quarter": (d.month - 1) // 3 + 1,
            "week_of_year": d.isocalendar()[1],
            "is_holiday": is_holiday,
            "holiday_name": h_name,
            "is_festival_window": is_festival_window,
            "festival_name": fest_name,
            "days_to_next_festival": days_to_next,
            "days_since_last_festival": days_since_last,
        })

    df = pd.DataFrame(rows)
    # Nullable int columns — pandas float64 NaN needs explicit conversion
    df["days_to_next_festival"] = df["days_to_next_festival"].astype("Int64")
    df["days_since_last_festival"] = df["days_since_last_festival"].astype("Int64")
    return df


def seed(start_year: int = 2024, extend_years: int = 3) -> None:
    start = date(start_year, 1, 1)
    end = date(date.today().year + extend_years, 12, 31)

    print(f"Building calendar {start} to {end} ...")
    df = build_calendar(start, end)
    print(f"  {len(df):,} rows generated")

    with engine.begin() as conn:
        conn.execute(text(CREATE_TABLE_SQL))

        upsert_sql = text("""
            INSERT INTO derived.calendar_dim (
                date, dow, is_weekend, month, quarter, week_of_year,
                is_holiday, holiday_name,
                is_festival_window, festival_name,
                days_to_next_festival, days_since_last_festival
            ) VALUES (
                :date, :dow, :is_weekend, :month, :quarter, :week_of_year,
                :is_holiday, :holiday_name,
                :is_festival_window, :festival_name,
                :days_to_next_festival, :days_since_last_festival
            )
            ON CONFLICT (date) DO UPDATE SET
                dow                      = EXCLUDED.dow,
                is_weekend               = EXCLUDED.is_weekend,
                month                    = EXCLUDED.month,
                quarter                  = EXCLUDED.quarter,
                week_of_year             = EXCLUDED.week_of_year,
                is_holiday               = EXCLUDED.is_holiday,
                holiday_name             = EXCLUDED.holiday_name,
                is_festival_window       = EXCLUDED.is_festival_window,
                festival_name            = EXCLUDED.festival_name,
                days_to_next_festival    = EXCLUDED.days_to_next_festival,
                days_since_last_festival = EXCLUDED.days_since_last_festival
        """)

        # Convert pandas NA (from nullable Int64) to Python None for psycopg2
        records = [
            {k: (None if pd.isna(v) else v) for k, v in row.items()}
            for row in df.to_dict("records")
        ]
        conn.execute(upsert_sql, records)
        print(f"  Upserted {len(records):,} rows into derived.calendar_dim")

    print("Done.")


if __name__ == "__main__":
    seed()

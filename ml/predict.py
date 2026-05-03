"""
ml/predict.py — Generate 7-day demand predictions using per-horizon models.

Loads demand_model_h1.json .. demand_model_h7.json + target_encoder.json.
Writes to derived.demand_predictions (TRUNCATE + INSERT on every run).
Products not in encoder fall back to WMA via COALESCE in SQL step 03/06.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus

import pandas as pd
import xgboost as xgb
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "model"
TARGET_ENCODER_PATH = MODEL_DIR / "target_encoder.json"
RUN_ID_PATH = MODEL_DIR / "run_id.txt"
STATS_PATH = MODEL_DIR / "last_predict_stats.json"

HORIZONS = [1, 2, 3, 4, 5, 6, 7]

FEATURE_COLS = [
    "lag_1_qty",
    "lag_7_qty",
    "last_7_day_stddev",
    "day_of_week",
    "is_holiday",
    "days_to_next_festival",
    "days_since_last_festival",
    "days_since_last_sale",
    "rolling_non_zero_count",
    "demand_trend_ratio",
    "zero_run_length",
    "is_recently_active",
    "product_id_target_encoded",
]

REQUIRED_PREDICTION_COLS = ["date", "product_id", "horizon_days", "predicted_qty", "model_version"]
SANITY_CAP_MULTIPLIER = 3.0

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS derived.demand_predictions (
    date          DATE     NOT NULL,
    product_id    TEXT     NOT NULL,
    horizon_days  INTEGER  NOT NULL,
    predicted_qty NUMERIC  NOT NULL,
    model_version TEXT     NOT NULL,
    PRIMARY KEY (date, product_id, horizon_days)
);
CREATE INDEX IF NOT EXISTS idx_demand_pred_product
ON derived.demand_predictions (product_id, date);
"""


def get_engine() -> Engine:
    load_dotenv(ROOT.parent / ".env")
    password = quote_plus(os.getenv("password", ""))
    url = (
        f"postgresql+psycopg2://{os.getenv('user')}:{password}"
        f"@{os.getenv('host')}:{os.getenv('port')}/{os.getenv('dbname')}"
    )
    return create_engine(url, future=True, pool_pre_ping=True)


def load_models() -> tuple[dict[int, xgb.XGBRegressor], dict, str]:
    """Load per-horizon models, target encoder, and run_id."""
    models: dict[int, xgb.XGBRegressor] = {}
    for h in HORIZONS:
        m = xgb.XGBRegressor()
        m.load_model(str(MODEL_DIR / f"demand_model_h{h}.json"))
        models[h] = m
    with open(TARGET_ENCODER_PATH) as f:
        encoder: dict = json.load(f)
    run_id = RUN_ID_PATH.read_text().strip()
    return models, encoder, run_id


def load_latest_features(engine: Engine) -> pd.DataFrame:
    """Most recent feature row per product + all engineered features."""
    return pd.read_sql(
        text("""
            SELECT DISTINCT ON (product_id)
                date, product_id, quantity_sold,
                lag_1_qty, lag_7_qty,
                last_7_day_avg, last_30_day_avg, last_60_day_avg,
                last_7_day_stddev, day_of_week,
                is_holiday, days_to_next_festival, days_since_last_festival
            FROM derived.product_daily_features
            WHERE lag_1_qty IS NOT NULL
            ORDER BY product_id, date DESC
        """),
        con=engine,
        parse_dates=["date"],
    )


def _add_engineered_for_predict(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute engineered features for the latest feature row per product.
    Since we have only one row per product, sequential features use last_*
    columns as proxies (full sequential computation needs full history).
    """
    df = df.copy()

    # days_since_last_sale — proxy: last_7_day_avg > 0 means recent activity
    df["days_since_last_sale"] = df["lag_1_qty"].apply(
        lambda x: 0.0 if x > 0 else 7.0
    ).astype("float32")

    # rolling_non_zero_count — proxy from last_7_day_avg
    df["rolling_non_zero_count"] = (
        (df["last_7_day_avg"] > 0).astype("float32") * 3.5
    ).astype("float32")

    # demand_trend_ratio
    df["demand_trend_ratio"] = (
        (df["last_7_day_avg"] / (df["last_30_day_avg"] + 1e-6))
        .clip(0, 10)
        .astype("float32")
    )

    # zero_run_length — proxy: lag_1 == 0 suggests a run
    df["zero_run_length"] = ((df["lag_1_qty"] == 0).astype("float32") * 3).astype("float32")

    # is_recently_active
    df["is_recently_active"] = (df["last_7_day_avg"] > 0).astype("float32")

    return df


def apply_target_encoding(df: pd.DataFrame, encoder: dict) -> pd.DataFrame:
    """Apply target encoding using training-period product means."""
    global_mean = encoder.get("__global_mean__", 0.0)
    df = df.copy()
    df["product_id_target_encoded"] = (
        df["product_id"].map(encoder)
        .fillna(global_mean)
        .astype("float32")
    )
    return df


def generate_predictions(
    features: pd.DataFrame,
    models: dict[int, xgb.XGBRegressor],
    encoder: dict,
    run_id: str,
) -> pd.DataFrame:
    """
    Run each horizon model on latest features.
    Products not in encoder are excluded — SQL COALESCE handles them with WMA.
    """
    features = _add_engineered_for_predict(features)
    features = apply_target_encoding(features, encoder)

    global_mean = encoder.get("__global_mean__", 0.0)
    known_mask = features["product_id"].isin(
        {k for k in encoder if k != "__global_mean__"}
    )
    features = features[known_mask].copy()

    for col in ["lag_1_qty", "lag_7_qty", "last_7_day_stddev",
                "day_of_week", "days_to_next_festival", "days_since_last_festival"]:
        features[col] = features[col].astype("float32")

    chunks = []
    for h in HORIZONS:
        X = features[FEATURE_COLS].fillna(0).astype("float32")
        preds = models[h].predict(X)
        chunk = pd.DataFrame({
            "date":         features["date"] + pd.Timedelta(days=h),
            "product_id":   features["product_id"].values,
            "horizon_days": h,
            "predicted_qty": preds,
            "model_version": run_id,
        })
        chunks.append(chunk)

    return pd.concat(chunks, ignore_index=True)


def clip_predictions(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["predicted_qty"] = df["predicted_qty"].clip(lower=0)
    return df


def apply_sanity_cap(preds: pd.DataFrame, features: pd.DataFrame) -> pd.DataFrame:
    """
    Remove predictions > SANITY_CAP_MULTIPLIER * (last_60_day_avg * 3).
    Excluded rows fall back to WMA via COALESCE in SQL.
    """
    cap_ref = features[["product_id", "last_60_day_avg"]].copy()
    cap_ref["cap"] = cap_ref["last_60_day_avg"].fillna(0) * 3 * SANITY_CAP_MULTIPLIER
    preds = preds.merge(cap_ref[["product_id", "cap"]], on="product_id", how="left")
    valid = (preds["cap"] == 0) | (preds["predicted_qty"] <= preds["cap"])
    return preds[valid].drop(columns=["cap"]).reset_index(drop=True)


def write_to_db(preds: pd.DataFrame, engine: Engine, total_active: int) -> dict:
    with engine.begin() as conn:
        for stmt in CREATE_TABLE_SQL.strip().split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))
        conn.execute(text("TRUNCATE TABLE derived.demand_predictions"))

    preds[REQUIRED_PREDICTION_COLS].to_sql(
        "demand_predictions",
        schema="derived",
        con=engine,
        if_exists="append",
        index=False,
        method="multi",
        chunksize=5000,
    )

    n_covered = preds["product_id"].nunique()
    stats = {
        "predicted_at": datetime.now().isoformat(),
        "products_covered": n_covered,
        "total_active_products": total_active,
        "fallback_count": total_active - n_covered,
        "total_rows_written": len(preds),
    }
    with open(STATS_PATH, "w") as f:
        json.dump(stats, f, indent=2)
    return stats


def main() -> None:
    engine = get_engine()
    print("[PREDICT] Loading models...")
    models, encoder, run_id = load_models()
    print(f"[PREDICT] Loaded {len(models)} horizon models | run_id: {run_id}")

    print("[PREDICT] Loading latest features...")
    features = load_latest_features(engine)
    total_active = len(features)
    print(f"[PREDICT] Active products: {total_active:,}")

    print("[PREDICT] Generating predictions...")
    preds = generate_predictions(features, models, encoder, run_id)
    preds = clip_predictions(preds)
    preds = apply_sanity_cap(preds, features)

    n_covered = preds["product_id"].nunique()
    coverage_pct = n_covered / total_active * 100
    print(f"[PREDICT] Coverage: {n_covered:,}/{total_active:,} ({coverage_pct:.1f}%)")

    if coverage_pct < 99.0:
        print(f"[PREDICT] WARNING: {total_active - n_covered} products use WMA fallback")

    stats = write_to_db(preds, engine, total_active)
    print(f"[PREDICT] Wrote {stats['total_rows_written']:,} rows to derived.demand_predictions")


if __name__ == "__main__":
    main()

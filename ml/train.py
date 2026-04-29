"""
ml/train.py — Demand forecasting pipeline v2.

Key changes from v1 design:
- Separate XGBoost model per horizon (h=1..7) — no multi-horizon confusion
- Target encoding replaces ordinal product_id_encoded
- Rolling averages removed from features (leakage reduction)
- 5 new engineered features added
- Memory-efficient: one horizon at a time, float32 throughout
- Fair evaluation: WMA and model on identical row indices
"""
from __future__ import annotations

import gc
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote_plus

import mlflow
import mlflow.xgboost
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from dotenv import load_dotenv
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "model"
METRICS_PATH = MODEL_DIR / "last_run_metrics.json"
RUN_ID_PATH = MODEL_DIR / "run_id.txt"
TARGET_ENCODER_PATH = MODEL_DIR / "target_encoder.json"

HORIZONS = [1, 2, 3, 4, 5, 6, 7]
TEST_DAYS = 30

# Rolling averages excluded — they are the WMA inputs (leakage).
# demand_trend_ratio derived from them is OK: captures direction, not level.
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

XGB_PARAMS: dict = {
    "n_estimators": 400,
    "max_depth": 6,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 5,
    "tree_method": "hist",
    "random_state": 42,
    "n_jobs": -1,
}


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

def get_engine() -> Engine:
    load_dotenv(ROOT.parent / ".env")
    password = quote_plus(os.getenv("password", ""))
    url = (
        f"postgresql+psycopg2://{os.getenv('user')}:{password}"
        f"@{os.getenv('host')}:{os.getenv('port')}/{os.getenv('dbname')}"
    )
    return create_engine(url, future=True, pool_pre_ping=True)


def load_features(engine: Engine) -> pd.DataFrame:
    """
    Load full product_daily_features INCLUDING stockout rows.
    Filtering happens after feature engineering so sequential signals
    (days_since_last_sale, zero_run_length) see the full history.
    Rolling averages loaded for demand_trend_ratio but NOT in FEATURE_COLS.
    """
    return pd.read_sql(
        text("""
            SELECT
                date, product_id, quantity_sold,
                lag_1_qty, lag_7_qty,
                last_7_day_avg, last_30_day_avg, last_60_day_avg,
                last_7_day_stddev, day_of_week,
                is_holiday, days_to_next_festival, days_since_last_festival,
                stockout_proxy
            FROM derived.product_daily_features
            ORDER BY product_id, date
        """),
        con=engine,
        parse_dates=["date"],
    )


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add 5 high-impact features. Run before filtering so sequential
    computations (zero run, last sale date) have full product history.
    """
    df = df.sort_values(["product_id", "date"]).copy()

    # 1. days_since_last_sale
    df["_sale_date"] = df["date"].where(df["quantity_sold"] > 0)
    df["_last_sale"] = df.groupby("product_id")["_sale_date"].ffill()
    df["days_since_last_sale"] = (
        (df["date"] - df["_last_sale"]).dt.days.fillna(999).astype("float32")
    )
    df.drop(columns=["_sale_date", "_last_sale"], inplace=True)

    # 2. rolling_non_zero_count — non-zero sale days in last 7 days
    df["rolling_non_zero_count"] = (
        df.groupby("product_id")["quantity_sold"]
        .transform(lambda x: (x > 0).astype(float).rolling(7, min_periods=1).sum())
        .astype("float32")
    )

    # 3. demand_trend_ratio — direction of recent vs medium-term demand
    #    Clipped at 10 to suppress extreme values on newly-active products
    df["demand_trend_ratio"] = (
        (df["last_7_day_avg"] / (df["last_30_day_avg"] + 1e-6))
        .clip(0, 10)
        .astype("float32")
    )

    # 4. zero_run_length — consecutive zero-sale days ending at current row
    #    Technique: within each product, cumsum of non-zero events creates
    #    a unique group ID for each zero run. Cumsum of is_zero within that
    #    group gives the run length.
    df["_is_zero"] = df["quantity_sold"] == 0
    df["_nz_cumsum"] = (
        (~df["_is_zero"]).groupby(df["product_id"]).cumsum()
    )
    df["zero_run_length"] = (
        df["_is_zero"]
        .astype(int)
        .groupby([df["product_id"], df["_nz_cumsum"]])
        .cumsum()
        .astype("float32")
    )
    df.drop(columns=["_is_zero", "_nz_cumsum"], inplace=True)

    # 5. is_recently_active — any sale in last 7 days
    df["is_recently_active"] = (df["rolling_non_zero_count"] > 0).astype("float32")

    return df


def filter_training_rows(df: pd.DataFrame) -> pd.DataFrame:
    """Remove stockout rows and rows missing lag features."""
    mask = (
        (~df["stockout_proxy"]) &
        df["lag_1_qty"].notna() &
        df["lag_7_qty"].notna()
    )
    return df[mask].copy().reset_index(drop=True)


def compute_target_encoding(
    df: pd.DataFrame, cutoff: pd.Timestamp
) -> tuple[pd.DataFrame, dict]:
    """
    Target encode product_id as mean quantity_sold in training period only.
    Computing from train rows prevents test leakage.
    Unseen products fall back to global mean.
    """
    train_rows = df[df["date"] <= cutoff]
    product_mean = train_rows.groupby("product_id")["quantity_sold"].mean()
    global_mean = float(train_rows["quantity_sold"].mean())

    encoder = product_mean.to_dict()
    encoder["__global_mean__"] = global_mean

    df = df.copy()
    df["product_id_target_encoded"] = (
        df["product_id"].map(product_mean)
        .fillna(global_mean)
        .astype("float32")
    )
    return df, encoder


def convert_to_float32(df: pd.DataFrame) -> pd.DataFrame:
    """Convert numeric feature columns to float32 to halve memory usage."""
    for col in ["lag_1_qty", "lag_7_qty", "last_7_day_stddev",
                "days_to_next_festival", "days_since_last_festival", "day_of_week"]:
        if col in df.columns:
            df[col] = df[col].astype("float32")
    return df


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def wma_prediction(df_rows: pd.DataFrame) -> pd.Series:
    """Current SQL WMA formula applied to a DataFrame slice."""
    return (
        0.6 * df_rows["last_7_day_avg"].fillna(0)
        + 0.3 * df_rows["last_30_day_avg"].fillna(0)
        + 0.1 * df_rows["last_60_day_avg"].fillna(0)
    )


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 4),
    }


def train_single_horizon(
    df: pd.DataFrame,
    horizon: int,
    cutoff: pd.Timestamp,
) -> tuple[xgb.XGBRegressor, dict, dict]:
    """
    Train one XGBRegressor for one horizon.
    Returns (model, model_metrics, wma_metrics).

    WMA is evaluated on the EXACT same row indices as the model test set
    to guarantee a fair comparison.
    """
    df_sorted = df.sort_values(["product_id", "date"])

    # Build target — shift within each product's time series
    target = df_sorted.groupby("product_id")["quantity_sold"].shift(-horizon)
    valid = target.notna()

    X = df_sorted.loc[valid, FEATURE_COLS].astype("float32")
    y = target[valid].astype("float32")
    dates = df_sorted.loc[valid, "date"]

    train_mask = dates <= cutoff
    test_mask  = dates > cutoff

    X_train, y_train = X[train_mask], y[train_mask]
    X_test,  y_test  = X[test_mask],  y[test_mask]

    # WMA on identical test row indices — guaranteed fair comparison
    wma_test = wma_prediction(df_sorted.loc[X_test.index])

    model = xgb.XGBRegressor(**XGB_PARAMS)
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    model_preds = model.predict(X_test)
    m_metrics  = _metrics(y_test.values, model_preds)
    wma_metrics = _metrics(y_test.values, wma_test.values)
    improvement = round(
        (wma_metrics["mae"] - m_metrics["mae"]) / wma_metrics["mae"] * 100, 1
    )

    print(
        f"  h={horizon:2d}  WMA MAE={wma_metrics['mae']:.4f}  "
        f"Model MAE={m_metrics['mae']:.4f}  "
        f"Δ={improvement:+.1f}%  "
        f"train={len(X_train):,}  test={len(X_test):,}"
    )

    # Free per-horizon memory before next iteration
    del X, y, X_train, y_train, target, valid
    gc.collect()

    return model, m_metrics, wma_metrics


def compute_shap_importance(
    model: xgb.XGBRegressor,
    X_sample: pd.DataFrame,
) -> list[dict]:
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_sample)
    return sorted(
        [
            {
                "feature": feat,
                "mean_abs_shap": round(float(np.abs(shap_values[:, i]).mean()), 4),
            }
            for i, feat in enumerate(X_sample.columns)
        ],
        key=lambda x: x["mean_abs_shap"],
        reverse=True,
    )


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def save_artifacts(
    models: dict[int, xgb.XGBRegressor],
    target_encoder: dict,
    run_id: str,
    metrics_summary: dict,
) -> None:
    MODEL_DIR.mkdir(exist_ok=True)
    for h, model in models.items():
        model.save_model(str(MODEL_DIR / f"demand_model_h{h}.json"))
    with open(TARGET_ENCODER_PATH, "w") as f:
        json.dump(target_encoder, f)
    with open(RUN_ID_PATH, "w") as f:
        f.write(run_id)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics_summary, f, indent=2)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> str:
    mlflow.set_tracking_uri(f"sqlite:///{ROOT}/mlflow.db")
    mlflow.set_experiment("demand_forecasting")

    engine = get_engine()
    print("[ML] Loading features...")
    df = load_features(engine)
    print(f"[ML] Loaded {len(df):,} rows, {df['product_id'].nunique():,} products")

    print("[ML] Engineering features...")
    df = add_engineered_features(df)
    df = filter_training_rows(df)
    df = convert_to_float32(df)
    print(f"[ML] After filter: {len(df):,} rows")

    cutoff = df["date"].max() - timedelta(days=TEST_DAYS)
    df, target_encoder = compute_target_encoding(df, cutoff)
    print(f"[ML] Target encoded {len(target_encoder) - 1} products | cutoff: {cutoff.date()}")
    print(f"[ML] Features ({len(FEATURE_COLS)}): {FEATURE_COLS}")
    print(f"[ML] Training {len(HORIZONS)} separate horizon models...")

    run_name = f"demand_v2_{datetime.now().strftime('%Y%m%d_%H%M')}"
    with mlflow.start_run(run_name=run_name) as run:
        run_id = run.info.run_id
        mlflow.log_params(XGB_PARAMS)
        mlflow.log_param("n_features", len(FEATURE_COLS))
        mlflow.log_param("features", json.dumps(FEATURE_COLS))
        mlflow.log_param("n_products", df["product_id"].nunique())
        mlflow.log_param("horizons", str(HORIZONS))

        models: dict[int, xgb.XGBRegressor] = {}
        all_model_metrics: dict[int, dict] = {}
        all_wma_metrics: dict[int, dict] = {}

        for h in HORIZONS:
            print(f"\n[ML] Horizon {h}...")
            model, m_metrics, wma_m = train_single_horizon(df, h, cutoff)
            models[h] = model
            all_model_metrics[h] = m_metrics
            all_wma_metrics[h] = wma_m
            mlflow.log_metrics({
                f"h{h}_model_mae":   m_metrics["mae"],
                f"h{h}_model_rmse":  m_metrics["rmse"],
                f"h{h}_wma_mae":     wma_m["mae"],
                f"h{h}_improvement": (wma_m["mae"] - m_metrics["mae"]) / wma_m["mae"] * 100,
            })

        improvements = [
            (all_wma_metrics[h]["mae"] - all_model_metrics[h]["mae"]) / all_wma_metrics[h]["mae"] * 100
            for h in HORIZONS
        ]
        avg_improvement = round(float(np.mean(improvements)), 1)
        mlflow.log_metric("avg_improvement_pct", avg_improvement)

        print(f"\n[ML] All horizons trained. Avg improvement: {avg_improvement:+.1f}%")
        print("\n[ML] Per-horizon summary:")
        print(f"  {'h':>4}  {'WMA MAE':>9}  {'Model MAE':>10}  {'Δ':>8}")
        for h in HORIZONS:
            imp = improvements[HORIZONS.index(h)]
            print(f"  {h:>4}  {all_wma_metrics[h]['mae']:>9.4f}  {all_model_metrics[h]['mae']:>10.4f}  {imp:>+7.1f}%")

        # SHAP on h=1 model (most actionable horizon)
        print("\n[ML] Computing SHAP for h=1...")
        df_sorted = df.sort_values(["product_id", "date"])
        target_h1 = df_sorted.groupby("product_id")["quantity_sold"].shift(-1)
        valid_h1 = target_h1.notna()
        X_h1 = df_sorted.loc[valid_h1, FEATURE_COLS].astype("float32")
        dates_h1 = df_sorted.loc[valid_h1, "date"]
        X_test_h1 = X_h1[dates_h1 > cutoff]
        X_sample = X_test_h1.sample(min(3000, len(X_test_h1)), random_state=42)
        shap_importance = compute_shap_importance(models[1], X_sample)
        mlflow.log_dict({"features": shap_importance}, "shap_importance_h1.json")
        print("[ML] Top 5 SHAP features:", [f["feature"] for f in shap_importance[:5]])

        mlflow.xgboost.log_model(models[1], "model_h1")

    metrics_summary = {
        "has_predictions": True,
        "model_version": run_id,
        "trained_at": datetime.now().isoformat(),
        "evaluated_days": TEST_DAYS,
        "model_mae": all_model_metrics[1]["mae"],
        "wma_mae": all_wma_metrics[1]["wma_mae"] if "wma_mae" in all_wma_metrics[1] else all_wma_metrics[1]["mae"],
        "improvement_pct": improvements[0],
        "avg_improvement_pct": avg_improvement,
        "per_horizon": {
            str(h): {
                "model_mae":  all_model_metrics[h]["mae"],
                "model_rmse": all_model_metrics[h]["rmse"],
                "wma_mae":    all_wma_metrics[h]["mae"],
                "improvement_pct": improvements[HORIZONS.index(h)],
            }
            for h in HORIZONS
        },
    }
    save_artifacts(models, target_encoder, run_id, metrics_summary)
    print(f"\n[ML] Artifacts saved to ml/model/. Run ID: {run_id}")
    return run_id


if __name__ == "__main__":
    main()

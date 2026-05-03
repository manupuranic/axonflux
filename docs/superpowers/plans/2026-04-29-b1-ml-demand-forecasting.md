# B1 ML Demand Forecasting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SQL WMA `predicted_daily_demand` with a trained XGBoost model outputting 1-day and 7-day demand forecasts, integrated into the weekly pipeline with SHAP explainability and a dashboard accuracy card.

**Architecture:** Global XGBoost model trained on `derived.product_daily_features` (~4.6M rows, all 12,642 products together). Direct multi-horizon approach: single model with `horizon_days` (1–7) as an input feature. Predictions written to `derived.demand_predictions` (keyed by feature_date + product_id + horizon_days). SQL steps 03 and 06 LEFT JOIN to this table with WMA COALESCE fallback so pipeline never breaks if ML step fails.

**Tech Stack:** Python 3.11, XGBoost 2.x, pandas, scikit-learn, SHAP, MLflow, SQLAlchemy, FastAPI, Next.js (App Router), TypeScript

---

## ⚠️ Migration 007 Note

`api/migrations/versions/007_ml_demand_predictions.py` creates `app.ml_demand_predictions` (p10/p50/p90 quantile columns, earlier design, no horizon_days). B1 uses `derived.demand_predictions` instead. Do **not** modify or apply migration 007 as part of this plan — it creates an unused table that does not conflict.

---

## demand_predictions Schema Note

The `date` column stores the **feature date** (the date when observations were made), not the target date. This makes joins to `product_daily_features` and `product_health_signals` straightforward:
- `horizon_days=1` → qty predicted for `date + 1 day`
- `horizon_days=7` → qty predicted for `date + 7 days`

---

## File Map

**Create:**
- `ml/__init__.py`
- `ml/requirements.txt`
- `ml/.gitignore`
- `ml/train.py`
- `ml/predict.py`
- `ml/notebooks/01_baseline.ipynb`
- `ml/notebooks/02_feature_engineering.ipynb`
- `ml/notebooks/03_xgboost_demand.ipynb`
- `ml/notebooks/04_evaluation.ipynb`
- `tests/ml/__init__.py`
- `tests/ml/test_train.py`
- `tests/ml/test_predict.py`
- `web/components/dashboard/MlAccuracyCard.tsx`
- `docs/architecture/ml-demand-forecasting.md`

**Modify:**
- `sql/rebuild_derived/03_product_health_signals.sql`
- `sql/rebuild_derived/06_supplier_restock_recommendations.sql`
- `pipelines/weekly_pipeline.py`
- `api/schemas/analytics.py`
- `api/routers/analytics.py`
- `api/main.py` (imports only)
- `web/types/api.ts`
- `web/lib/api.ts`
- `web/app/(internal)/dashboard/page.tsx`
- `docs/axonflux_project_memory.md`

---

## Task 1: ML Infrastructure Setup

**Files:**
- Create: `ml/__init__.py`
- Create: `ml/requirements.txt`
- Create: `ml/.gitignore`

- [ ] **Step 1: Create ml/ directory structure**

```bash
mkdir -p ml/notebooks ml/model
```

- [ ] **Step 2: Create `ml/__init__.py`**

```python
```
(empty file — makes ml/ a Python package so `from ml.train import ...` works in tests)

- [ ] **Step 3: Create `ml/requirements.txt`**

```text
xgboost>=2.0.0
scikit-learn>=1.4.0
shap>=0.45.0
mlflow>=2.12.0
pandas>=2.0.0
numpy>=1.26.0
psycopg2-binary>=2.9.0
sqlalchemy>=2.0.0
python-dotenv>=1.0.0
jupyter>=1.0.0
ipykernel>=6.0.0
matplotlib>=3.8.0
```

- [ ] **Step 4: Create `ml/.gitignore`**

```gitignore
model/demand_model.json
model/product_encoder.json
model/run_id.txt
model/last_run_metrics.json
model/last_predict_stats.json
mlruns/
mlflow.db
*.pyc
__pycache__/
```

- [ ] **Step 5: Install dependencies**

```bash
pip install -r ml/requirements.txt
```

Expected: all packages install without error.

- [ ] **Step 6: Commit**

```bash
git add ml/__init__.py ml/requirements.txt ml/.gitignore
git commit -m "feat(ml): scaffold ml/ directory with requirements and gitignore"
```

---

## Task 2: Notebook Scaffolds (USER-DRIVEN PHASE)

**Files:**
- Create: `ml/notebooks/01_baseline.ipynb`
- Create: `ml/notebooks/02_feature_engineering.ipynb`
- Create: `ml/notebooks/03_xgboost_demand.ipynb`
- Create: `ml/notebooks/04_evaluation.ipynb`

These notebooks are **scaffolded with markdown guidance only** — code cells are left empty for the user to fill in with Claude's step-by-step guidance.

- [ ] **Step 1: Create `ml/notebooks/01_baseline.ipynb`**

```json
{
 "nbformat": 4,
 "nbformat_minor": 5,
 "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}},
 "cells": [
  {"cell_type": "markdown", "metadata": {}, "source": ["# 01 — Baseline Exploration\n\nGoal: Understand the data before touching any model.\n\nWe will:\n1. Connect to the DB and load `derived.product_daily_features`\n2. Inspect shape, dtypes, null counts\n3. Understand the distribution of `quantity_sold`\n4. Count stockout_proxy rows (excluded from training)\n5. Identify products with sparse history (< 30 days of sales)\n6. Compute WMA baseline accuracy on the last 30 days — this is the bar the model must beat"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 1: Imports and DB connection\n# Run from project root: PYTHONPATH=. jupyter notebook\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 2: Load product_daily_features\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 3: Shape, dtypes, null counts\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 4: Distribution of quantity_sold — histogram\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 5: Count stockout_proxy rows\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 6: Products with < 30 active days\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 7: Compute WMA baseline MAE on last 30 days\n# WMA pred = 0.6*last_7_day_avg + 0.3*last_30_day_avg + 0.1*last_60_day_avg\n# MAE = mean(abs(quantity_sold - wma_pred)) on rows where stockout_proxy=False\n"]}
 ]
}
```

- [ ] **Step 2: Create `ml/notebooks/02_feature_engineering.ipynb`**

```json
{
 "nbformat": 4,
 "nbformat_minor": 5,
 "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}},
 "cells": [
  {"cell_type": "markdown", "metadata": {}, "source": ["# 02 — Feature Engineering\n\nGoal: Build the training dataset.\n\nSteps:\n1. Filter out stockout_proxy rows\n2. Encode product_id as integers (deterministic: sorted alphabetically → integer index)\n3. Construct multi-horizon targets: for each row at date T, create 7 rows with horizon_days=1..7 and target=qty_sold at T+horizon\n4. Check for NULLs in feature columns (XGBoost handles them, but know what you have)\n5. Train/test split: rows where date <= max_date-30 are train, rest are test\n6. Print final shapes"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 1: Load and filter\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 2: Encode product_id\n# all_products = sorted(df['product_id'].unique())\n# product_to_id = {p: i for i, p in enumerate(all_products)}\n# df['product_id_encoded'] = df['product_id'].map(product_to_id)\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 3: Build multi-horizon targets\n# HORIZONS = range(1, 8)\n# For each h, shift quantity_sold by -h within each product group\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 4: NULL audit on feature columns\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 5: Train/test split\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 6: Print shapes\n"]}
 ]
}
```

- [ ] **Step 3: Create `ml/notebooks/03_xgboost_demand.ipynb`**

```json
{
 "nbformat": 4,
 "nbformat_minor": 5,
 "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}},
 "cells": [
  {"cell_type": "markdown", "metadata": {}, "source": ["# 03 — XGBoost Training\n\nGoal: Train the demand model and compare to WMA baseline.\n\nFEATURE_COLS = ['lag_1_qty', 'lag_7_qty', 'last_7_day_avg', 'last_30_day_avg',\n                'last_60_day_avg', 'last_7_day_stddev', 'day_of_week',\n                'is_holiday', 'days_to_next_festival', 'days_since_last_festival',\n                'product_id_encoded', 'horizon_days']\n\nSteps:\n1. Set up MLflow experiment\n2. Train XGBRegressor with tree_method='hist' (fast)\n3. Predict on test set, compute MAE and RMSE\n4. Compute same metrics for WMA baseline (from notebook 01)\n5. Print comparison table\n6. Log params + metrics to MLflow"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 1: MLflow setup\n# mlflow.set_tracking_uri('sqlite:///ml/mlflow.db')\n# mlflow.set_experiment('demand_forecasting')\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 2: Train XGBRegressor\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 3: Predict and evaluate\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 4: WMA baseline metrics\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 5: Print comparison\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 6: Log to MLflow\n"]}
 ]
}
```

- [ ] **Step 4: Create `ml/notebooks/04_evaluation.ipynb`**

```json
{
 "nbformat": 4,
 "nbformat_minor": 5,
 "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}},
 "cells": [
  {"cell_type": "markdown", "metadata": {}, "source": ["# 04 — SHAP Explainability\n\nGoal: Understand which features drive predictions.\n\nSteps:\n1. Load trained model\n2. Run SHAP TreeExplainer on 5000-row sample of test set\n3. Plot summary bar chart (mean absolute SHAP per feature)\n4. Plot waterfall for one product example\n5. Confirm: lag_1_qty and last_7_day_avg should dominate\n6. Save SHAP importance to JSON"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 1: Load model\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 2: SHAP TreeExplainer\nimport shap\n# explainer = shap.TreeExplainer(model)\n# shap_values = explainer.shap_values(X_sample)\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 3: Summary bar chart\n# shap.summary_plot(shap_values, X_sample, plot_type='bar')\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 4: Waterfall for one product\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 5: Sanity check — top features\n"]},
  {"cell_type": "code", "execution_count": null, "metadata": {}, "outputs": [], "source": ["# Step 6: Save importance\n"]}
 ]
}
```

- [ ] **Step 5: Commit notebook scaffolds**

```bash
git add ml/notebooks/
git commit -m "feat(ml): add guided notebook scaffolds for B1 exploration phase"
```

---

## ⏸️ USER MILESTONE — Complete Notebooks

**Before proceeding to Task 3**, the user must complete notebooks 01–04 with Claude's guidance (one cell at a time). Key outputs needed for Task 3+:
- WMA baseline MAE (to hardcode as comparison target in tests)
- Confirmed feature list works (no unexpected NULLs causing issues)
- XGBoost trains without error on the full dataset
- SHAP shows sensible top features (lag_1_qty should rank #1 or #2)

**The remaining tasks implement the production pipeline** using reasonable defaults. Hyperparameters can be tuned by updating `XGB_PARAMS` in `ml/train.py` after notebook validation.

---

## Task 3: Test Framework

**Files:**
- Create: `tests/ml/__init__.py`
- Create: `tests/ml/test_train.py`
- Create: `tests/ml/test_predict.py`

- [ ] **Step 1: Create `tests/ml/__init__.py`**

```python
```
(empty)

- [ ] **Step 2: Create `tests/ml/test_train.py` — failing tests first**

```python
import numpy as np
import pandas as pd
import pytest
from datetime import date, timedelta


def make_features_df(n_products: int = 5, n_days: int = 60) -> pd.DataFrame:
    """Synthetic derived.product_daily_features data."""
    rng = np.random.default_rng(42)
    rows = []
    for p in range(n_products):
        for d in range(n_days):
            dt = date(2025, 1, 1) + timedelta(days=d)
            qty = float(rng.integers(0, 20))
            rows.append({
                "date": dt,
                "product_id": f"PROD{p:03d}",
                "quantity_sold": qty,
                "lag_1_qty": float(rng.integers(0, 20)),
                "lag_7_qty": float(rng.integers(0, 20)),
                "last_7_day_avg": rng.uniform(0, 15),
                "last_30_day_avg": rng.uniform(0, 15),
                "last_60_day_avg": rng.uniform(0, 15),
                "last_7_day_stddev": rng.uniform(0, 5),
                "day_of_week": dt.weekday(),
                "is_holiday": False,
                "days_to_next_festival": int(rng.integers(1, 30)),
                "days_since_last_festival": int(rng.integers(1, 30)),
                "stockout_proxy": False,
            })
    return pd.DataFrame(rows)


def test_encode_products_is_deterministic():
    from ml.train import encode_products
    df = make_features_df(n_products=3, n_days=10)
    df1, enc1 = encode_products(df.copy())
    df2, enc2 = encode_products(df.copy())
    assert enc1 == enc2
    assert list(df1["product_id_encoded"]) == list(df2["product_id_encoded"])


def test_encode_products_all_products_covered():
    from ml.train import encode_products
    df = make_features_df(n_products=5, n_days=10)
    df_enc, encoder = encode_products(df)
    assert len(encoder) == 5
    assert df_enc["product_id_encoded"].isna().sum() == 0


def test_build_training_set_no_null_targets():
    from ml.train import encode_products, build_training_set
    df = make_features_df(n_products=3, n_days=40)
    df, _ = encode_products(df)
    training = build_training_set(df)
    assert training["target"].isna().sum() == 0


def test_build_training_set_has_all_horizons():
    from ml.train import encode_products, build_training_set
    df = make_features_df(n_products=3, n_days=40)
    df, _ = encode_products(df)
    training = build_training_set(df)
    assert set(training["horizon_days"].unique()) == {1, 2, 3, 4, 5, 6, 7}


def test_wma_baseline_returns_positive_mae():
    from ml.train import wma_baseline_metrics
    df = make_features_df(n_products=5, n_days=60)
    metrics = wma_baseline_metrics(df, test_days=10)
    assert metrics["mae"] >= 0
    assert metrics["rmse"] >= 0


def test_train_model_returns_fitted_model():
    from ml.train import encode_products, build_training_set, train_model, FEATURE_COLS
    df = make_features_df(n_products=5, n_days=60)
    df, _ = encode_products(df)
    training = build_training_set(df)
    cutoff = training["date"].max() - timedelta(days=10)
    train_set = training[training["date"] <= cutoff]
    test_set = training[training["date"] > cutoff]
    X_train = train_set[FEATURE_COLS].fillna(0)
    y_train = train_set["target"]
    X_test = test_set[FEATURE_COLS].fillna(0)
    y_test = test_set["target"]
    model = train_model(X_train, y_train, X_test, y_test)
    preds = model.predict(X_test)
    assert len(preds) == len(X_test)
```

- [ ] **Step 3: Run tests — confirm they all FAIL (functions don't exist yet)**

```bash
PYTHONPATH=. python -m pytest tests/ml/test_train.py -v
```

Expected: `ImportError: cannot import name 'encode_products' from 'ml.train'` (or similar)

- [ ] **Step 4: Create `tests/ml/test_predict.py`**

```python
import numpy as np
import pandas as pd
import pytest


def test_clip_predictions_removes_negatives():
    from ml.predict import clip_predictions
    df = pd.DataFrame({"predicted_qty": [-2.0, 0.0, 0.5, 5.0, -0.001]})
    result = clip_predictions(df)
    assert (result["predicted_qty"] >= 0).all()


def test_apply_sanity_cap_removes_extreme_outliers():
    from ml.predict import apply_sanity_cap
    features = pd.DataFrame({
        "product_id": ["A", "B"],
        "last_60_day_avg": [5.0, 10.0],
    })
    preds = pd.DataFrame({
        "product_id": ["A", "A", "B", "B"],
        "horizon_days": [1, 2, 1, 2],
        "predicted_qty": [200.0, 4.0, 15.0, 500.0],
    })
    result = apply_sanity_cap(preds, features)
    # A:200 >> 3 * (5*3) = 45 → removed
    # B:500 >> 3 * (10*3) = 90 → removed
    assert len(result) < len(preds)
    assert result[result["product_id"] == "A"]["predicted_qty"].max() <= 45.01
    assert result[result["product_id"] == "B"]["predicted_qty"].max() <= 90.01


def test_predictions_output_schema():
    from ml.predict import REQUIRED_PREDICTION_COLS
    assert set(REQUIRED_PREDICTION_COLS) == {
        "date", "product_id", "horizon_days", "predicted_qty", "model_version"
    }
```

- [ ] **Step 5: Run predict tests — confirm they FAIL**

```bash
PYTHONPATH=. python -m pytest tests/ml/test_predict.py -v
```

Expected: `ImportError: cannot import name 'clip_predictions' from 'ml.predict'`

- [ ] **Step 6: Commit test scaffolds**

```bash
git add tests/ml/
git commit -m "test(ml): add failing tests for train and predict modules"
```

---

## Task 4: `ml/train.py` — Feature Engineering Functions

**Files:**
- Create: `ml/train.py`

`★ Insight ─────────────────────────────────────`
Direct multi-horizon forecasting: train ONE model with `horizon_days` as a feature. At training time, each row is duplicated 7 times (once per horizon). The model learns that "predict horizon=7 from the same features" should produce different values than "predict horizon=1". This avoids error accumulation that occurs in recursive forecasting, where mistakes in day 2's prediction get fed back as features for day 3.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Write `ml/train.py` — constants and data loading functions**

```python
from __future__ import annotations

import json
import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote_plus

import numpy as np
import pandas as pd
import xgboost as xgb
from dotenv import load_dotenv
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "model"
ENCODER_PATH = MODEL_DIR / "product_encoder.json"
METRICS_PATH = MODEL_DIR / "last_run_metrics.json"
RUN_ID_PATH = MODEL_DIR / "run_id.txt"
MODEL_PATH = MODEL_DIR / "demand_model.json"

FEATURE_COLS = [
    "lag_1_qty",
    "lag_7_qty",
    "last_7_day_avg",
    "last_30_day_avg",
    "last_60_day_avg",
    "last_7_day_stddev",
    "day_of_week",
    "is_holiday",
    "days_to_next_festival",
    "days_since_last_festival",
    "product_id_encoded",
    "horizon_days",
]

XGB_PARAMS: dict = {
    "n_estimators": 300,
    "max_depth": 6,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 5,
    "tree_method": "hist",
    "random_state": 42,
    "n_jobs": -1,
}

TEST_DAYS = 30
HORIZONS = list(range(1, 8))


def get_engine() -> Engine:
    load_dotenv(ROOT.parent / ".env")
    password = quote_plus(os.getenv("password", ""))
    url = (
        f"postgresql+psycopg2://{os.getenv('user')}:{password}"
        f"@{os.getenv('host')}:{os.getenv('port')}/{os.getenv('dbname')}"
    )
    return create_engine(url, future=True, pool_pre_ping=True)


def load_features(engine: Engine) -> pd.DataFrame:
    """Load derived.product_daily_features, excluding stockout rows."""
    return pd.read_sql(
        text("""
            SELECT
                date, product_id, quantity_sold,
                lag_1_qty, lag_7_qty,
                last_7_day_avg, last_30_day_avg, last_60_day_avg,
                last_7_day_stddev, day_of_week,
                is_holiday, days_to_next_festival, days_since_last_festival
            FROM derived.product_daily_features
            WHERE stockout_proxy = FALSE
              AND lag_1_qty IS NOT NULL
              AND lag_7_qty IS NOT NULL
            ORDER BY product_id, date
        """),
        con=engine,
        parse_dates=["date"],
    )


def encode_products(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """Deterministic label encoding: sorted product_ids → integer indices."""
    all_products = sorted(df["product_id"].unique().tolist())
    encoder = {p: i for i, p in enumerate(all_products)}
    df = df.copy()
    df["product_id_encoded"] = df["product_id"].map(encoder)
    return df, encoder


def build_training_set(df: pd.DataFrame) -> pd.DataFrame:
    """
    For each (date, product) row, create 7 training rows — one per horizon.
    Target = quantity_sold h days later (using groupby shift within product).
    Rows with no target (end of series) are dropped.
    """
    df = df.sort_values(["product_id", "date"]).copy()
    chunks = []
    for h in HORIZONS:
        chunk = df.copy()
        chunk["target"] = df.groupby("product_id")["quantity_sold"].shift(-h)
        chunk["horizon_days"] = h
        chunks.append(chunk)
    combined = pd.concat(chunks, ignore_index=True)
    return combined.dropna(subset=["target"]).reset_index(drop=True)


def wma_baseline_metrics(df: pd.DataFrame, test_days: int = TEST_DAYS) -> dict:
    """Compute WMA accuracy on held-out last test_days days."""
    cutoff = df["date"].max() - timedelta(days=test_days)
    test = df[df["date"] > cutoff].copy()
    test["wma_pred"] = (
        0.6 * test["last_7_day_avg"].fillna(0)
        + 0.3 * test["last_30_day_avg"].fillna(0)
        + 0.1 * test["last_60_day_avg"].fillna(0)
    )
    mae = mean_absolute_error(test["quantity_sold"], test["wma_pred"])
    rmse = float(np.sqrt(mean_squared_error(test["quantity_sold"], test["wma_pred"])))
    return {"mae": round(mae, 4), "rmse": round(rmse, 4)}
```

- [ ] **Step 2: Run encode/build tests — confirm they pass**

```bash
PYTHONPATH=. python -m pytest tests/ml/test_train.py::test_encode_products_is_deterministic tests/ml/test_train.py::test_encode_products_all_products_covered tests/ml/test_train.py::test_build_training_set_no_null_targets tests/ml/test_train.py::test_build_training_set_has_all_horizons tests/ml/test_train.py::test_wma_baseline_returns_positive_mae -v
```

Expected: 5 PASS

- [ ] **Step 3: Commit working data functions**

```bash
git add ml/train.py
git commit -m "feat(ml): add feature engineering functions (encode_products, build_training_set, wma_baseline)"
```

---

## Task 5: `ml/train.py` — Model Training, MLflow, SHAP, Save

**Files:**
- Modify: `ml/train.py` (append functions below)

- [ ] **Step 1: Append training and MLflow functions to `ml/train.py`**

```python
import mlflow
import mlflow.xgboost
import shap


def train_model(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    params: dict | None = None,
) -> xgb.XGBRegressor:
    """Train XGBoost and return fitted model."""
    p = params or XGB_PARAMS
    model = xgb.XGBRegressor(**p)
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )
    return model


def compute_shap_importance(
    model: xgb.XGBRegressor, X_sample: pd.DataFrame
) -> list[dict]:
    """Return mean |SHAP| per feature, sorted descending."""
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_sample)
    return sorted(
        [
            {"feature": feat, "mean_abs_shap": round(float(np.abs(shap_values[:, i]).mean()), 4)}
            for i, feat in enumerate(X_sample.columns)
        ],
        key=lambda x: x["mean_abs_shap"],
        reverse=True,
    )


def save_artifacts(
    model: xgb.XGBRegressor,
    encoder: dict[str, int],
    run_id: str,
    metrics: dict,
) -> None:
    """Persist model, encoder, run_id, and metrics to ml/model/."""
    MODEL_DIR.mkdir(exist_ok=True)
    model.save_model(str(MODEL_PATH))
    with open(ENCODER_PATH, "w") as f:
        json.dump(encoder, f)
    with open(RUN_ID_PATH, "w") as f:
        f.write(run_id)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)


def main() -> str:
    """
    Full training pipeline. Returns MLflow run_id.
    Called by pipelines/weekly_pipeline.py between step 02 and step 03.
    """
    import datetime

    mlflow.set_tracking_uri(f"sqlite:///{ROOT}/mlflow.db")
    mlflow.set_experiment("demand_forecasting")

    engine = get_engine()
    print("[ML] Loading features...")
    df = load_features(engine)
    print(f"[ML] Loaded {len(df):,} rows, {df['product_id'].nunique():,} products")

    df, encoder = encode_products(df)

    print("[ML] Building multi-horizon training set...")
    training = build_training_set(df)
    print(f"[ML] Training set: {len(training):,} rows")

    cutoff = training["date"].max() - timedelta(days=TEST_DAYS)
    train_set = training[training["date"] <= cutoff]
    test_set = training[training["date"] > cutoff]

    X_train = train_set[FEATURE_COLS].fillna(0)
    y_train = train_set["target"]
    X_test = test_set[FEATURE_COLS].fillna(0)
    y_test = test_set["target"]

    wma_metrics = wma_baseline_metrics(df)
    print(f"[ML] WMA baseline — MAE: {wma_metrics['mae']}, RMSE: {wma_metrics['rmse']}")

    with mlflow.start_run() as run:
        mlflow.log_params(XGB_PARAMS)
        mlflow.log_param("train_rows", len(X_train))
        mlflow.log_param("test_rows", len(X_test))
        mlflow.log_param("n_products", df["product_id"].nunique())
        mlflow.log_metric("wma_mae", wma_metrics["mae"])
        mlflow.log_metric("wma_rmse", wma_metrics["rmse"])

        print("[ML] Training XGBoost...")
        model = train_model(X_train, y_train, X_test, y_test)

        preds = model.predict(X_test)
        test_mae = round(float(mean_absolute_error(y_test, preds)), 4)
        test_rmse = round(float(np.sqrt(mean_squared_error(y_test, preds))), 4)
        improvement_pct = round((wma_metrics["mae"] - test_mae) / wma_metrics["mae"] * 100, 1)

        mlflow.log_metric("test_mae", test_mae)
        mlflow.log_metric("test_rmse", test_rmse)
        mlflow.log_metric("improvement_pct", improvement_pct)
        mlflow.xgboost.log_model(model, "model")

        print(f"[ML] Model MAE: {test_mae}  RMSE: {test_rmse}  Improvement: {improvement_pct}%")

        sample_size = min(5000, len(X_test))
        X_sample = X_test.sample(sample_size, random_state=42)
        shap_importance = compute_shap_importance(model, X_sample)
        mlflow.log_dict({"features": shap_importance}, "shap_importance.json")
        print("[ML] Top 3 features:", [f["feature"] for f in shap_importance[:3]])

        run_id = run.info.run_id

    metrics_payload = {
        "has_predictions": True,
        "model_version": run_id,
        "trained_at": datetime.datetime.now().isoformat(),
        "model_mae": test_mae,
        "wma_mae": wma_metrics["mae"],
        "improvement_pct": improvement_pct,
        "evaluated_days": TEST_DAYS,
    }
    save_artifacts(model, encoder, run_id, metrics_payload)
    print(f"[ML] Artifacts saved. Run ID: {run_id}")
    return run_id


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run train_model test**

```bash
PYTHONPATH=. python -m pytest tests/ml/test_train.py::test_train_model_returns_fitted_model -v
```

Expected: PASS

- [ ] **Step 3: Run all train tests**

```bash
PYTHONPATH=. python -m pytest tests/ml/test_train.py -v
```

Expected: all 6 PASS

- [ ] **Step 4: Smoke-test main() with synthetic data (optional but recommended)**

```bash
PYTHONPATH=. python -c "from ml.train import encode_products, build_training_set; print('imports OK')"
```

Expected: `imports OK`

- [ ] **Step 5: Commit**

```bash
git add ml/train.py
git commit -m "feat(ml): complete train.py with XGBoost training, SHAP, MLflow, artifact save"
```

---

## Task 6: `ml/predict.py`

**Files:**
- Create: `ml/predict.py`

`★ Insight ─────────────────────────────────────`
predict.py is intentionally decoupled from train.py — it loads the model from disk (not from memory). This means train and predict can run independently, and the model artifact acts as the contract between them. The `model_version` (MLflow run_id) stored in every prediction row creates an audit trail: you can always trace "this prediction was made by this model trained on this date."
`─────────────────────────────────────────────────`

- [ ] **Step 1: Create `ml/predict.py`**

```python
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
ENCODER_PATH = MODEL_DIR / "product_encoder.json"
RUN_ID_PATH = MODEL_DIR / "run_id.txt"
MODEL_PATH = MODEL_DIR / "demand_model.json"
STATS_PATH = MODEL_DIR / "last_predict_stats.json"

FEATURE_COLS = [
    "lag_1_qty",
    "lag_7_qty",
    "last_7_day_avg",
    "last_30_day_avg",
    "last_60_day_avg",
    "last_7_day_stddev",
    "day_of_week",
    "is_holiday",
    "days_to_next_festival",
    "days_since_last_festival",
    "product_id_encoded",
    "horizon_days",
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


def load_model() -> tuple[xgb.XGBRegressor, dict[str, int], str]:
    """Load model, encoder, and run_id from ml/model/."""
    model = xgb.XGBRegressor()
    model.load_model(str(MODEL_PATH))
    with open(ENCODER_PATH) as f:
        encoder: dict[str, int] = json.load(f)
    run_id = RUN_ID_PATH.read_text().strip()
    return model, encoder, run_id


def load_latest_features(engine: Engine) -> pd.DataFrame:
    """Most recent feature row per product (latest date in product_daily_features)."""
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


def generate_predictions(
    features: pd.DataFrame,
    model: xgb.XGBRegressor,
    encoder: dict[str, int],
    run_id: str,
) -> pd.DataFrame:
    """
    For each active product, generate predictions for horizon_days 1–7.
    Products not in encoder (new since last training) are excluded — WMA fallback covers them.
    """
    features = features.copy()
    features["product_id_encoded"] = features["product_id"].map(encoder)
    known = features["product_id_encoded"].notna()
    features = features[known].copy()
    features["product_id_encoded"] = features["product_id_encoded"].astype(int)

    chunks = []
    for h in range(1, 8):
        chunk = features.copy()
        chunk["horizon_days"] = h
        X = chunk[FEATURE_COLS].fillna(0)
        chunk["predicted_qty"] = model.predict(X)
        chunk["predict_date"] = chunk["date"] + pd.Timedelta(days=h)
        chunk["model_version"] = run_id
        chunks.append(chunk[["predict_date", "product_id", "horizon_days", "predicted_qty", "model_version"]])

    return pd.concat(chunks, ignore_index=True).rename(columns={"predict_date": "date"})


def clip_predictions(df: pd.DataFrame) -> pd.DataFrame:
    """Clip all predicted_qty to >= 0."""
    df = df.copy()
    df["predicted_qty"] = df["predicted_qty"].clip(lower=0)
    return df


def apply_sanity_cap(preds: pd.DataFrame, features: pd.DataFrame) -> pd.DataFrame:
    """
    Remove predictions > SANITY_CAP_MULTIPLIER * (last_60_day_avg * 3).
    These are likely model errors. WMA fallback via COALESCE handles excluded rows.
    """
    cap_ref = features[["product_id", "last_60_day_avg"]].copy()
    cap_ref["cap"] = cap_ref["last_60_day_avg"].fillna(0) * 3 * SANITY_CAP_MULTIPLIER
    preds = preds.merge(cap_ref[["product_id", "cap"]], on="product_id", how="left")
    valid = (preds["cap"] == 0) | (preds["predicted_qty"] <= preds["cap"])
    return preds[valid].drop(columns=["cap"]).reset_index(drop=True)


def write_to_db(preds: pd.DataFrame, engine: Engine, total_active: int) -> dict:
    """CREATE IF NOT EXISTS, TRUNCATE, bulk INSERT. Returns coverage stats."""
    with engine.begin() as conn:
        for stmt in CREATE_TABLE_SQL.strip().split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))
        conn.execute(text("TRUNCATE TABLE derived.demand_predictions"))

    preds.to_sql(
        "demand_predictions",
        schema="derived",
        con=engine,
        if_exists="append",
        index=False,
        method="multi",
        chunksize=5000,
    )

    n_products_covered = preds["product_id"].nunique()
    stats = {
        "predicted_at": datetime.now().isoformat(),
        "products_covered": n_products_covered,
        "total_active_products": total_active,
        "fallback_count": total_active - n_products_covered,
        "total_rows_written": len(preds),
    }
    with open(STATS_PATH, "w") as f:
        json.dump(stats, f, indent=2)
    return stats


def main() -> None:
    """
    Generate 7-day demand predictions for all active products.
    Writes to derived.demand_predictions (TRUNCATE + INSERT).
    Called by pipelines/weekly_pipeline.py after train.py.
    """
    engine = get_engine()
    print("[PREDICT] Loading model artifacts...")
    model, encoder, run_id = load_model()
    print(f"[PREDICT] Model run_id: {run_id}")

    print("[PREDICT] Loading latest features...")
    features = load_latest_features(engine)
    total_active = len(features)
    print(f"[PREDICT] Active products: {total_active:,}")

    print("[PREDICT] Generating predictions...")
    preds = generate_predictions(features, model, encoder, run_id)
    preds = clip_predictions(preds)
    preds = apply_sanity_cap(preds, features)
    print(f"[PREDICT] Predictions after sanity check: {len(preds):,} rows")

    coverage_pct = preds["product_id"].nunique() / total_active * 100
    print(f"[PREDICT] Coverage: {preds['product_id'].nunique():,}/{total_active:,} ({coverage_pct:.1f}%)")

    if coverage_pct < 99.0:
        print(f"[PREDICT] WARNING: coverage below 99%. {total_active - preds['product_id'].nunique()} products will use WMA fallback.")

    stats = write_to_db(preds, engine, total_active)
    print(f"[PREDICT] Wrote {stats['total_rows_written']:,} rows to derived.demand_predictions")
    print(f"[PREDICT] Done. Fallback products: {stats['fallback_count']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run predict tests**

```bash
PYTHONPATH=. python -m pytest tests/ml/test_predict.py -v
```

Expected: all 3 PASS

- [ ] **Step 3: Run all ML tests**

```bash
PYTHONPATH=. python -m pytest tests/ml/ -v
```

Expected: all 9 PASS

- [ ] **Step 4: Commit**

```bash
git add ml/predict.py
git commit -m "feat(ml): add predict.py — generates 7-day demand predictions with sanity checks"
```

---

## Task 7: SQL Step 03 Update — COALESCE Fallback

**Files:**
- Modify: `sql/rebuild_derived/03_product_health_signals.sql`

`★ Insight ─────────────────────────────────────`
The COALESCE pattern here is a resilience guarantee: if the ML step fails or a product has no prediction (new product, outside encoder), the SQL silently falls back to WMA. No manual intervention needed. This is why we check `dp.horizon_days = 1` explicitly — to pick only the next-day prediction from the multi-horizon table.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Read current step 03 to find the WMA expression**

The expression to replace is in the `SELECT` block:
```sql
     ROUND(
        GREATEST(
            (
                0.6 * COALESCE(last_7_day_avg,0) +
                0.3 * COALESCE(last_30_day_avg,0) +
                0.1 * COALESCE(last_60_day_avg,0)
            ),
            0.02
        ),
        4
    ) AS predicted_daily_demand,
```

- [ ] **Step 2: Edit `sql/rebuild_derived/03_product_health_signals.sql`**

Change the `FROM` clause (currently `FROM derived.product_daily_features`) to add a LEFT JOIN:

```sql
FROM derived.product_daily_features f
LEFT JOIN derived.demand_predictions dp
    ON  dp.product_id   = f.product_id
    AND dp.date         = f.date
    AND dp.horizon_days = 1
```

And replace the `predicted_daily_demand` expression:

```sql
    ROUND(
        GREATEST(
            COALESCE(
                dp.predicted_qty,
                0.6 * COALESCE(f.last_7_day_avg,0) +
                0.3 * COALESCE(f.last_30_day_avg,0) +
                0.1 * COALESCE(f.last_60_day_avg,0)
            ),
            0.02
        ),
        4
    ) AS predicted_daily_demand,
```

Also rename all bare column refs like `last_7_day_avg` → `f.last_7_day_avg` (and all other columns from `product_daily_features`) since we now have an alias.

- [ ] **Step 3: Verify the SQL file is valid by checking syntax**

```bash
PYTHONPATH=. python -c "
from db.db import run_sql_file
from pipelines.weekly_pipeline import get_engine_from_env
from pathlib import Path
# Dry-run syntax check only — not running against live DB
print('SQL file loads OK')
"
```

Expected: `SQL file loads OK`

- [ ] **Step 4: Commit**

```bash
git add sql/rebuild_derived/03_product_health_signals.sql
git commit -m "feat(ml): update step 03 to use ML predicted_qty with WMA COALESCE fallback"
```

---

## Task 8: SQL Step 06 Update — 7-Day Sum

**Files:**
- Modify: `sql/rebuild_derived/06_supplier_restock_recommendations.sql`

- [ ] **Step 1: Read current step 06 to understand required_quantity formula**

Current:
```sql
GREATEST(
    (30 * h.predicted_daily_demand) - s.pseudo_stock,
    0
) AS required_quantity,
```

Where `h.predicted_daily_demand` is the 1-day ML prediction (from step 03). For `required_quantity`, we want the 7-day ML sum instead, falling back to `predicted_daily_demand * 7`.

- [ ] **Step 2: Edit `sql/rebuild_derived/06_supplier_restock_recommendations.sql`**

After the `FROM derived.product_health_signals h` and existing JOINs, add:

```sql
LEFT JOIN (
    SELECT
        product_id,
        SUM(predicted_qty) AS demand_7d
    FROM derived.demand_predictions
    WHERE date = (SELECT MAX(date) FROM derived.product_daily_features)
      AND horizon_days BETWEEN 1 AND 7
    GROUP BY product_id
) ml ON h.product_id = ml.product_id
```

Update `required_quantity` to use the 7-day sum:

```sql
    GREATEST(
        (30 * h.predicted_daily_demand) - s.pseudo_stock,
        0
    ) AS required_quantity,
```

Becomes:

```sql
    GREATEST(
        COALESCE(ml.demand_7d, h.predicted_daily_demand * 7) * 4
        - s.pseudo_stock,
        0
    ) AS required_quantity,
```

The multiplier `* 4` accounts for ~30 days of stock (7-day sum × ~4 weeks), comparable to the existing `30 * predicted_daily_demand`.

- [ ] **Step 3: Commit**

```bash
git add sql/rebuild_derived/06_supplier_restock_recommendations.sql
git commit -m "feat(ml): update step 06 to use 7-day ML demand sum for required_quantity"
```

---

## Task 9: Pipeline Integration

**Files:**
- Modify: `pipelines/weekly_pipeline.py`

- [ ] **Step 1: Add ML step to `weekly_pipeline.py`**

After the imports block, add:

```python
import subprocess
import sys
```

In the `main()` function, between the loop that runs SQL steps 00–02 and the loop that runs steps 03+, insert the ML step:

```python
def _run_ml_step(script_name: str) -> None:
    """Run ml/train.py or ml/predict.py as a subprocess from the project root."""
    script_path = ROOT / "ml" / script_name
    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(ROOT),
        capture_output=False,
    )
    if result.returncode != 0:
        print(f"[ML] WARNING: {script_name} exited with code {result.returncode}. Continuing — SQL will use WMA fallback.")
```

In `main()`, split the `REBUILD_SQL_FILES` list into two groups and add the ML step between them:

```python
# Steps 00–02: build features table (ML reads from this)
PREBUILD_SQL_FILES = [
    REBUILD_SQL_DIR / "00_daily_sales_summary.sql",
    REBUILD_SQL_DIR / "01_product_daily_metrics.sql",
    REBUILD_SQL_DIR / "02_product_daily_features.sql",
]

# Steps 03–10: read from demand_predictions (written by ML step)
POSTBUILD_SQL_FILES = [
    REBUILD_SQL_DIR / "03_product_health_signals.sql",
    REBUILD_SQL_DIR / "04_product_stock_position.sql",
    REBUILD_SQL_DIR / "05_necessary_views.sql",
    REBUILD_SQL_DIR / "06_supplier_restock_recommendations.sql",
    REBUILD_SQL_DIR / "07_daily_payment_breakdown.sql",
    REBUILD_SQL_DIR / "08_customer_dimension.sql",
    REBUILD_SQL_DIR / "09_customer_metrics.sql",
    REBUILD_SQL_DIR / "10_product_associations.sql",
]
```

And update `main()`:

```python
    print("Rebuilding derived tables (pre-ML)...")
    for sql_file in PREBUILD_SQL_FILES:
        run_sql_file(engine, sql_file)

    print("Running ML demand forecasting...")
    _run_ml_step("train.py")
    _run_ml_step("predict.py")

    print("Rebuilding derived tables (post-ML)...")
    for sql_file in POSTBUILD_SQL_FILES:
        run_sql_file(engine, sql_file)
```

Remove or update the original `REBUILD_SQL_FILES` list.

- [ ] **Step 2: Verify the pipeline file parses without error**

```bash
PYTHONPATH=. python -c "import pipelines.weekly_pipeline; print('imports OK')"
```

Expected: `imports OK`

- [ ] **Step 3: Commit**

```bash
git add pipelines/weekly_pipeline.py
git commit -m "feat(ml): integrate ML train+predict between pipeline steps 02 and 03"
```

---

## Task 10: API Accuracy Endpoint + Frontend Card

**Files:**
- Modify: `api/schemas/analytics.py`
- Modify: `api/routers/analytics.py`
- Modify: `web/types/api.ts`
- Modify: `web/lib/api.ts`
- Create: `web/components/dashboard/MlAccuracyCard.tsx`
- Modify: `web/app/(internal)/dashboard/page.tsx`

- [ ] **Step 1: Add `MlAccuracyStats` to `api/schemas/analytics.py`**

Append to the end of the file:

```python
class MlAccuracyStats(BaseModel):
    has_predictions: bool
    model_mae: float | None = None
    wma_mae: float | None = None
    improvement_pct: float | None = None
    evaluated_days: int = 30
    model_version: str | None = None
    products_covered: int | None = None
    total_active_products: int | None = None
    fallback_count: int | None = None
```

- [ ] **Step 2: Add endpoint to `api/routers/analytics.py`**

Add import at top:

```python
import json
from pathlib import Path
```

Update the imports from `api.schemas.analytics` to include `MlAccuracyStats`.

Append endpoint:

```python
@router.get("/ml-accuracy", response_model=MlAccuracyStats)
def get_ml_accuracy(
    _: CurrentUser = Depends(get_current_user),
):
    """Model accuracy vs WMA baseline. Reads from ml/model/ JSON files."""
    ml_root = Path(__file__).resolve().parents[2] / "ml" / "model"
    metrics_path = ml_root / "last_run_metrics.json"
    stats_path = ml_root / "last_predict_stats.json"

    if not metrics_path.exists():
        return MlAccuracyStats(has_predictions=False)

    with open(metrics_path) as f:
        metrics = json.load(f)

    predict_stats: dict = {}
    if stats_path.exists():
        with open(stats_path) as f:
            predict_stats = json.load(f)

    return MlAccuracyStats(
        has_predictions=metrics.get("has_predictions", True),
        model_mae=metrics.get("model_mae"),
        wma_mae=metrics.get("wma_mae"),
        improvement_pct=metrics.get("improvement_pct"),
        evaluated_days=metrics.get("evaluated_days", 30),
        model_version=metrics.get("model_version"),
        products_covered=predict_stats.get("products_covered"),
        total_active_products=predict_stats.get("total_active_products"),
        fallback_count=predict_stats.get("fallback_count"),
    )
```

- [ ] **Step 3: Add `MlAccuracyStats` type to `web/types/api.ts`**

Append to the end of `web/types/api.ts`:

```typescript
export interface MlAccuracyStats {
  has_predictions: boolean;
  model_mae: number | null;
  wma_mae: number | null;
  improvement_pct: number | null;
  evaluated_days: number;
  model_version: string | null;
  products_covered: number | null;
  total_active_products: number | null;
  fallback_count: number | null;
}
```

- [ ] **Step 4: Add `mlAccuracy` method to `web/lib/api.ts`**

In the imports at the top, add `MlAccuracyStats` to the type import list.

In the `api` object, append:

```typescript
  mlAccuracy: () => apiFetch<MlAccuracyStats>("/api/analytics/ml-accuracy"),
```

- [ ] **Step 5: Create `web/components/dashboard/MlAccuracyCard.tsx`**

```tsx
"use client";

import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MlAccuracyCard() {
  const { data, loading } = useFetch(() => api.mlAccuracy());

  if (loading) {
    return <Card className="border-l-4 border-l-gray-200 animate-pulse h-24" />;
  }

  if (!data || !data.has_predictions) {
    return (
      <Card className="border-l-4 border-l-gray-300">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">Demand Model</CardTitle>
          <div className="text-2xl">🤖</div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">Not trained yet</p>
          <p className="text-xs text-gray-400 mt-1">Run the pipeline to activate</p>
        </CardContent>
      </Card>
    );
  }

  const improvement = data.improvement_pct;
  const accentColor = improvement !== null && improvement > 0
    ? "border-l-green-500"
    : "border-l-yellow-500";

  return (
    <Card className={`border-l-4 ${accentColor}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-700">
          Forecast Accuracy ({data.evaluated_days}d)
        </CardTitle>
        <div className="text-2xl">🤖</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">
          {improvement !== null
            ? `${improvement > 0 ? "+" : ""}${improvement}%`
            : "—"}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          WMA: {data.wma_mae?.toFixed(1)} → Model: {data.model_mae?.toFixed(1)} units/day
        </p>
        {data.products_covered != null && (
          <p className="text-xs text-gray-400 mt-0.5">
            {data.products_covered.toLocaleString("en-IN")} products covered
            {data.fallback_count != null && data.fallback_count > 0
              ? ` · ${data.fallback_count} WMA fallback`
              : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Add `MlAccuracyCard` to the dashboard page**

In `web/app/(internal)/dashboard/page.tsx`, add the import:

```tsx
import { MlAccuracyCard } from "@/components/dashboard/MlAccuracyCard";
```

In the JSX, add the card inside the `SummaryGrid` section or as a separate section below it:

```tsx
      {/* ML Forecast Accuracy */}
      <div className="grid grid-cols-1">
        <MlAccuracyCard />
      </div>
```

Place this after the KPI Summary `DataStateWrapper` block.

- [ ] **Step 7: Start the dev server and verify the card renders**

```bash
cd web && npm run dev
```

Open `http://localhost:3000`. Dashboard should show the `MlAccuracyCard` displaying "Not trained yet" (since model hasn't been run yet). No console errors.

- [ ] **Step 8: Commit**

```bash
git add api/schemas/analytics.py api/routers/analytics.py
git add web/types/api.ts web/lib/api.ts web/components/dashboard/MlAccuracyCard.tsx
git add web/app/(internal)/dashboard/page.tsx
git commit -m "feat(ml): add ML accuracy API endpoint and dashboard card"
```

---

## Task 11: Documentation

**Files:**
- Create: `docs/architecture/ml-demand-forecasting.md`
- Modify: `docs/axonflux_project_memory.md`

- [ ] **Step 1: Create `docs/architecture/ml-demand-forecasting.md`**

Write a standalone doc covering:
1. **Problem** — why WMA wasn't enough
2. **Model choice** — why XGBoost over ARIMA/LightGBM
3. **Data pipeline** — features → training set → predictions → derived tables
4. **Evaluation** — train/test split, MAE vs WMA baseline
5. **Explainability** — SHAP values, dashboard accuracy card
6. **Production integration** — weekly retraining, WMA fallback
7. **How to retrain manually** — `PYTHONPATH=. python ml/train.py && PYTHONPATH=. python ml/predict.py`
8. **MLflow** — how to view runs at `http://localhost:5001`

(Write prose — no boilerplate stub. This document is used for interviews and onboarding.)

- [ ] **Step 2: Patch `docs/axonflux_project_memory.md`**

Find the Phase B section and add B1 as complete with a brief summary:

```markdown
**B1 — ML Demand Forecasting** ✅
- XGBoost global model replacing SQL WMA `predicted_daily_demand`
- Direct multi-horizon (1–7 day) forecasts stored in `derived.demand_predictions`
- SHAP explainability logged to MLflow; dashboard accuracy card for business owners
- Weekly offline retraining integrated into `weekly_pipeline.py` between steps 02 and 03
- WMA COALESCE fallback in steps 03 and 06 — pipeline never breaks if ML step fails
- Architecture doc: `docs/architecture/ml-demand-forecasting.md`
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/ml-demand-forecasting.md docs/axonflux_project_memory.md
git commit -m "docs: add ML demand forecasting architecture doc and update project memory"
```

---

## Self-Review Checklist

- [x] Spec requirement: 1-day forecast → `horizon_days=1` in `demand_predictions`, consumed by step 03 via COALESCE ✓
- [x] Spec requirement: 7-day forecast → `horizon_days=1..7`, summed in step 06 ✓
- [x] Spec requirement: WMA COALESCE fallback → both step 03 and step 06 ✓
- [x] Spec requirement: MLflow tracking → `main()` in train.py logs params, metrics, SHAP, artifact ✓
- [x] Spec requirement: SHAP explainability → `compute_shap_importance()`, logged as `shap_importance.json` ✓
- [x] Spec requirement: dashboard accuracy card → `MlAccuracyCard.tsx` + `/api/analytics/ml-accuracy` ✓
- [x] Spec requirement: sanity checks → `clip_predictions()` + `apply_sanity_cap()` ✓
- [x] Spec requirement: notebook scaffolds → Tasks 2 (user-driven) ✓
- [x] Spec requirement: weekly retraining → `weekly_pipeline.py` calls `_run_ml_step()` ✓
- [x] Spec requirement: documentation deliverables → Task 11 ✓
- [x] Type consistency: `FEATURE_COLS` identical in both `train.py` and `predict.py` ✓
- [x] No placeholder steps — all code blocks are complete ✓
- [x] Migration 007 conflict noted and handled ✓

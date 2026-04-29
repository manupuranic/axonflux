# B1 — ML Demand Forecasting Design

**Date:** 2026-04-29
**Status:** Approved
**Phase:** B1 (after B2 Basket Analysis, B3 Entity Resolution)

---

## Problem Statement

The current `predicted_daily_demand` in `derived.product_health_signals` uses a hardcoded Weighted Moving Average (WMA):

```
0.6 × last_7_day_avg + 0.3 × last_30_day_avg + 0.1 × last_60_day_avg
```

This formula:
- Ignores day-of-week patterns (weekends sell differently)
- Ignores festivals and holidays
- Uses fixed weights regardless of product volatility
- Cannot differentiate between a product trending up vs a product randomly spiking
- Produces only a 1-day scalar — no multi-day forecast for restock planning

**Goal:** Replace WMA with a validated XGBoost model that produces both a 1-day prediction (for health signals) and a 7-day forecast (for replenishment planning), with explainability and a measurable accuracy improvement over WMA.

---

## Forecasting Horizon

- **1-day ahead:** Replaces `predicted_daily_demand` in `derived.product_health_signals`
- **7-day ahead:** Powers restock quantity in `derived.supplier_restock_recommendations`

---

## Model Choice: XGBoost Global Model

**Why XGBoost over alternatives:**

| Option | Verdict |
|---|---|
| XGBoost (global, all products) | **Chosen.** Handles 12,642 products × 365 days = ~4.6M rows well. One model, one training job. Industry standard for tabular retail forecasting. |
| ARIMA per product | Rejected. 12,642 separate models = hours to train. Needs ~2 years for annual seasonality. Breaks on sparse/intermittent products. |
| LightGBM global | Valid alternative. Marginally faster but near-identical accuracy. XGBoost has better learning resources for this team. |

**Global model:** All products trained together. Product identity encoded as a feature so the model learns per-product bias while sharing patterns (day-of-week effects, trend signals) across the entire catalog.

---

## Data

**Source:** `derived.product_daily_features` (~4.6M rows, date × product)

**Exclusion:** Rows where `stockout_proxy = TRUE` are excluded from training. A zero-sale day caused by an empty shelf is not true zero demand — including it would teach the model the wrong thing.

**Input features:**

| Feature | Why |
|---|---|
| `lag_1_qty` | Yesterday's sales — strongest single predictor |
| `lag_7_qty` | Same weekday last week — captures weekly rhythm |
| `last_7_day_avg` | Short-term trend |
| `last_30_day_avg` | Medium-term baseline |
| `last_60_day_avg` | Long-term baseline |
| `last_7_day_stddev` | Product volatility — high stddev = noisy product |
| `day_of_week` | Weekends and weekdays sell differently |
| `is_holiday` | Already in features table |
| `days_to_next_festival` | Already in features table |
| `days_since_last_festival` | Already in features table |
| `product_id` (label-encoded) | Per-product bias |

**Note on calendar features:** `is_holiday`, `days_to_next_festival`, `days_since_last_festival` may be NULL if `derived.calendar_dim` has not been seeded. XGBoost handles NULL features natively (treats them as a separate branch condition). These features will contribute zero when absent and improve predictions when present.

**Target variable:** `quantity_sold` for the prediction horizon date.

**Train/test split:**
- Train: all history before the last 30 days
- Test (held-out): last 30 days — never seen during training
- This mirrors real-world use: the model always predicts forward, never backward

---

## Two Models

**Model A — 1-day ahead**
Trained directly: feature row at date T → predict `quantity_sold` at date T+1.

**Model B — 7-day ahead (recursive)**
Uses Model A recursively: predict day T+1, feed that prediction as `lag_1` to predict T+2, and so on through T+7. This is called a recursive multi-step forecast.

Both models trained weekly as part of the pipeline (offline batch retraining). Full retrain from scratch each run — XGBoost trains in minutes on this data volume, no need for incremental/online learning.

---

## New Database Table

**`derived.demand_predictions`** — truncated and rebuilt every pipeline run.

```sql
date          DATE     -- the future date being predicted
product_id    TEXT     -- barcode (canonical, after alias resolution)
horizon_days  INTEGER  -- 1 = tomorrow, 2 = day after, ... 7 = 7 days out
predicted_qty NUMERIC  -- XGBoost output, clipped to >= 0
model_version TEXT     -- MLflow run ID (audit trail)
PRIMARY KEY (date, product_id, horizon_days)
```

---

## Pipeline Integration

New step inserted between SQL step 02 and step 03 in `weekly_pipeline.py`:

```
step 00 → 01 → 02   (SQL, unchanged)
      ↓
  ml/train.py        retrain XGBoost models A and B on derived.product_daily_features
  ml/predict.py      generate 7-day predictions, write to derived.demand_predictions
      ↓
step 03 → 04 → ...  (SQL reads from demand_predictions via COALESCE)
```

**Step 03 SQL change — COALESCE fallback:**
```sql
-- Before:
0.6 * last_7_day_avg + 0.3 * last_30_day_avg + 0.1 * last_60_day_avg AS predicted_daily_demand

-- After:
COALESCE(dp.predicted_qty, 0.6 * f.last_7_day_avg + 0.3 * f.last_30_day_avg + 0.1 * f.last_60_day_avg)
    AS predicted_daily_demand
```

If a product has no ML prediction (new product, missing history), it silently falls back to WMA. Pipeline never breaks.

**Step 06 (replenishment) change:**
Step 06 currently derives restock quantity from `predicted_daily_demand` in `product_health_signals` (the 1-day signal × a multiplier). After B1, it will LEFT JOIN directly to `demand_predictions` and use `SUM(predicted_qty) WHERE horizon_days BETWEEN 1 AND 7` — a true 7-day forward sum rather than a scaled single-day estimate. COALESCE fallback applies here too: if no ML prediction exists, falls back to `predicted_daily_demand * 7`.

---

## Evaluation

**Metric:** MAE (Mean Absolute Error) and RMSE (Root Mean Square Error) on held-out last 30 days.

- MAE = "on average, we were off by X units per product per day" — easy to explain
- RMSE = same but penalises large misses more — useful for catching products with big errors

**WMA baseline computed identically** on the same held-out 30 days for a like-for-like comparison.

**Sanity checks before writing predictions to DB:**
- No negative predictions (clipped to 0)
- No product predicted > 3× its historical maximum (flagged, not written)
- Coverage ≥ 99% of active products must have predictions

**Shipped regardless** if sanity checks pass and predictions look reasonable — but MLflow logs full metrics so accuracy trend is visible over time.

---

## Explainability

**For developers — SHAP values:**
SHAP (SHapley Additive exPlanations) decomposes each prediction into feature contributions. Example:

```
Product: Dettol 250ml | Predicted: 18 units tomorrow
  lag_1_qty            +6.2  (sold 22 units yesterday)
  day_of_week          +3.1  (Mondays strong for this product)
  last_7_day_avg       +2.8  (rising short trend)
  is_holiday           -1.4  (tomorrow is a holiday)
  baseline              7.3
```

SHAP values saved to MLflow on each training run.

**For business owners — accuracy card (dashboard):**
```
Demand Forecast Accuracy — Last 30 Days
  Previous method (WMA):    avg error 4.2 units/day
  Current model (XGBoost):  avg error 2.7 units/day
  Improvement: 36%

  Products covered: 12,589 / 12,642 (99.6%)
  Fallback to WMA:  53 products (new or insufficient history)
```

Displayed as a card on the existing Next.js dashboard. No jargon — just error in units and improvement percentage.

**Fallback transparency:** Products using WMA fallback are flagged in the predictions table and in the accuracy card.

---

## Retraining Strategy

**Offline batch retraining, weekly.**

- Runs automatically as part of `weekly_pipeline.py`
- Full retrain from scratch on all available history
- Previous model artifact retained in MLflow for rollback
- If retraining fails, pipeline logs error and continues — step 03 falls back to WMA via COALESCE

---

## Notebook Sequence (exploratory phase — user-driven)

Notebooks in `ml/notebooks/`. User drives, guided step by step.

| Notebook | Purpose |
|---|---|
| `01_baseline.ipynb` | Explore `product_daily_features`: distributions, missing values, stockout_proxy counts, products with sparse history |
| `02_feature_engineering.ipynb` | Build training dataset: filter stockouts, encode product_id, construct target variable, train/test split |
| `03_xgboost_1day.ipynb` | Train 1-day model, tune hyperparameters, evaluate on test set, compare to WMA baseline |
| `04_xgboost_7day.ipynb` | Train 7-day recursive model, evaluate per-horizon error |
| `05_evaluation.ipynb` | SHAP analysis, MLflow run comparison, final accuracy card output |

---

## MLflow Tracking

Every training run logs:
- Training date range and row count
- Feature list
- Hyperparameters (n_estimators, max_depth, learning_rate)
- MAE and RMSE on test set (model and WMA baseline)
- SHAP feature importance chart
- Model artifact (saved for inference)
- Model version ID (written to `demand_predictions.model_version`)

MLflow UI: `http://localhost:5001`

---

## Documentation Deliverables

1. **`docs/architecture/ml-demand-forecasting.md`** — standalone architecture doc covering model choice, data pipeline, evaluation, explainability, and retraining strategy. Readable by a hiring manager, new developer, or business owner.

2. **`docs/axonflux_project_memory.md`** — patched in-place with B1 section summary.

---

## File Structure

```
ml/
├── notebooks/
│   ├── 01_baseline.ipynb
│   ├── 02_feature_engineering.ipynb
│   ├── 03_xgboost_1day.ipynb
│   ├── 04_xgboost_7day.ipynb
│   └── 05_evaluation.ipynb
├── train.py              # pipeline-integrated retraining script
├── predict.py            # generates demand_predictions rows
├── model/                # saved model artifacts (gitignored)
└── mlflow.db             # MLflow tracking store (gitignored)

sql/rebuild_derived/
├── 03_product_health_signals.sql   # updated: COALESCE(dp.predicted_qty, WMA)
└── 06_supplier_restock_recommendations.sql  # updated: 7-day sum from demand_predictions

pipelines/
└── weekly_pipeline.py    # updated: ml step between step 02 and step 03

web/src/
└── (dashboard card for accuracy summary)
```

---

## Out of Scope

- Per-product ARIMA models
- Online/incremental learning
- Price elasticity features (no price change data in raw layer)
- External demand signals (weather, competitor pricing)

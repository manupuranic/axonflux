"""
Analytics API tests — summary endpoint structure, health signal flags.

Fixture data (seeded in conftest):
  daily_sales_summary: 2 rows (CURRENT_DATE-1, CURRENT_DATE-2) with known revenue
  product_health_signals: FAST_PROD_001 (fast), DEAD_PROD_001 (dead) on CURRENT_DATE-1
  customer_dimension/metrics: 4 identified + 1 walk-in
"""


class TestAnalyticsSummary:
    def test_summary_returns_200(self, client, staff_headers):
        resp = client.get("/api/analytics/summary", headers=staff_headers)
        assert resp.status_code == 200

    def test_summary_has_required_fields(self, client, staff_headers):
        body = client.get("/api/analytics/summary", headers=staff_headers).json()
        required = [
            "latest_date", "total_revenue_last_7d", "total_bills_last_7d",
            "fast_moving_count", "slow_moving_count", "dead_stock_count",
            "demand_spike_count", "total_unique_customers",
        ]
        for field in required:
            assert field in body, f"Missing field: {field}"

    def test_summary_latest_date_is_most_recent_sale(self, client, staff_headers):
        from datetime import date, timedelta

        body = client.get("/api/analytics/summary", headers=staff_headers).json()
        expected = (date.today() - timedelta(days=1)).isoformat()
        assert body["latest_date"] == expected

    def test_summary_revenue_matches_seeded_data(self, client, staff_headers):
        body = client.get("/api/analytics/summary", headers=staff_headers).json()
        # Both seeded days fall within last 7d: 25000 + 22500 = 47500
        assert body["total_revenue_last_7d"] == 47500.0

    def test_summary_health_signal_counts(self, client, staff_headers):
        body = client.get("/api/analytics/summary", headers=staff_headers).json()
        assert body["fast_moving_count"] == 1
        assert body["dead_stock_count"] == 1
        assert body["slow_moving_count"] == 0
        assert body["demand_spike_count"] == 0

    def test_summary_customer_counts(self, client, staff_headers):
        body = client.get("/api/analytics/summary", headers=staff_headers).json()
        assert body["total_unique_customers"] == 4  # WALK-IN excluded

    def test_summary_requires_auth(self, client):
        resp = client.get("/api/analytics/summary")
        assert resp.status_code == 401


class TestHealthSignals:
    def test_health_signals_endpoint_returns_200(self, client, staff_headers):
        resp = client.get("/api/analytics/health-signals", headers=staff_headers)
        assert resp.status_code == 200

    def test_health_signals_fast_filter(self, client, staff_headers):
        resp = client.get("/api/analytics/health-signals", params={"signal": "fast"}, headers=staff_headers)
        assert resp.status_code == 200
        body = resp.json()
        items = body if isinstance(body, list) else body.get("items", [])
        product_ids = [i.get("product_id") or i.get("barcode") for i in items]
        assert "FAST_PROD_001" in product_ids

    def test_health_signals_dead_filter(self, client, staff_headers):
        resp = client.get("/api/analytics/health-signals", params={"signal": "dead"}, headers=staff_headers)
        assert resp.status_code == 200
        body = resp.json()
        items = body if isinstance(body, list) else body.get("items", [])
        product_ids = [i.get("product_id") or i.get("barcode") for i in items]
        assert "DEAD_PROD_001" in product_ids

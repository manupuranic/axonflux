"""
Customer API tests — lapsed tier math, active filter, summary counts.

Fixture data (seeded in conftest):
  9876540001 — active   (days_since=10)
  9876540002 — at-risk  (days_since=35)
  9876540003 — lapsed   (days_since=65)
  9876540004 — lost     (days_since=95)
  WALK-IN    — excluded from non-walk-in queries
"""


class TestCustomerSummary:
    def test_summary_returns_200(self, client, staff_headers):
        resp = client.get("/api/customers/summary", headers=staff_headers)
        assert resp.status_code == 200

    def test_summary_counts_non_walkin_only(self, client, staff_headers):
        body = client.get("/api/customers/summary", headers=staff_headers).json()
        # 4 identified customers seeded; WALK-IN excluded
        assert body["total_unique_customers"] == 4

    def test_summary_repeat_customers(self, client, staff_headers):
        body = client.get("/api/customers/summary", headers=staff_headers).json()
        # All 4 seeded identified customers have is_repeat=True
        assert body["repeat_customer_count"] == 4
        assert body["repeat_customer_percent"] == 100.0

    def test_summary_new_customers_last_30d(self, client, staff_headers):
        body = client.get("/api/customers/summary", headers=staff_headers).json()
        # All 4 have first_seen_date='2025-01-01' — none are new in last 30d
        assert body["new_customers_last_30d"] == 0


class TestLapsedTierMath:
    def test_at_risk_tier_contains_correct_customer(self, client, staff_headers):
        resp = client.get("/api/customers/lapsed", params={"tier": "at-risk"}, headers=staff_headers)
        assert resp.status_code == 200
        mobiles = {c["mobile_clean"] for c in resp.json()["items"]}
        assert "9876540002" in mobiles   # days=35, at-risk window [30,60)
        assert "9876540001" not in mobiles  # days=10, active

    def test_lapsed_tier_contains_correct_customer(self, client, staff_headers):
        resp = client.get("/api/customers/lapsed", params={"tier": "lapsed"}, headers=staff_headers)
        mobiles = {c["mobile_clean"] for c in resp.json()["items"]}
        assert "9876540003" in mobiles   # days=65, lapsed window [60,90)

    def test_lost_tier_contains_correct_customer(self, client, staff_headers):
        resp = client.get("/api/customers/lapsed", params={"tier": "lost"}, headers=staff_headers)
        mobiles = {c["mobile_clean"] for c in resp.json()["items"]}
        assert "9876540004" in mobiles   # days=95, lost >= 90

    def test_active_tier_excludes_lapsed(self, client, staff_headers):
        resp = client.get("/api/customers/lapsed", params={"tier": "active"}, headers=staff_headers)
        mobiles = {c["mobile_clean"] for c in resp.json()["items"]}
        assert "9876540001" in mobiles
        assert "9876540002" not in mobiles
        assert "9876540003" not in mobiles

    def test_summary_counts_all_tiers(self, client, staff_headers):
        resp = client.get("/api/customers/lapsed", headers=staff_headers)
        summary = resp.json()["summary"]
        assert summary["active_count"] == 1   # days=10
        assert summary["at_risk_count"] == 1  # days=35
        assert summary["lapsed_count"] == 1   # days=65
        assert summary["lost_count"] == 1     # days=95

    def test_no_tier_returns_all_repeat_non_walkin(self, client, staff_headers):
        resp = client.get("/api/customers/lapsed", headers=staff_headers)
        body = resp.json()
        assert body["total"] == 4

    def test_walkin_excluded_from_lapsed(self, client, staff_headers):
        resp = client.get("/api/customers/lapsed", headers=staff_headers)
        mobiles = {c["mobile_clean"] for c in resp.json()["items"]}
        assert "WALK-IN" not in mobiles


class TestCustomerList:
    def test_list_excludes_walkin_by_default(self, client, staff_headers):
        resp = client.get("/api/customers", headers=staff_headers)
        assert resp.status_code == 200
        mobiles = {c["mobile_clean"] for c in resp.json()["items"]}
        assert "WALK-IN" not in mobiles

    def test_list_includes_walkin_when_requested(self, client, staff_headers):
        resp = client.get("/api/customers", params={"include_walkin": True}, headers=staff_headers)
        mobiles = {c["mobile_clean"] for c in resp.json()["items"]}
        assert "WALK-IN" in mobiles

    def test_list_requires_auth(self, client):
        resp = client.get("/api/customers")
        assert resp.status_code == 401

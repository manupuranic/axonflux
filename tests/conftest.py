"""
Shared test infrastructure for AxonFlux API tests.

DB strategy: persistent axonflux_test DB (run scripts/setup_test_db.py once).
Each pytest session truncates + re-seeds all relevant tables.
Per-test isolation: tests use UUID barcodes/keys so there are no conflicts.

Dependency overrides are applied at module level (before any TestClient is created)
so every request in the session hits the test DB.
"""
import os
import uuid
from urllib.parse import quote_plus

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from api.core.security import hash_password
from api.dependencies import get_conn, get_db
from api.main import app

# ---------------------------------------------------------------------------
# Test DB engine — swap axonflux → axonflux_test, same host/user/password
# ---------------------------------------------------------------------------
load_dotenv()
_user = os.getenv("user")
_password = quote_plus(os.getenv("password", ""))
_host = os.getenv("host", "localhost")
_port = os.getenv("port", "5432")

TEST_DB_URL = f"postgresql+psycopg2://{_user}:{_password}@{_host}:{_port}/axonflux_test"
test_engine = create_engine(TEST_DB_URL, pool_pre_ping=True, future=True)
TestSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False, future=True)


# ---------------------------------------------------------------------------
# Dependency overrides — applied once at import time
# ---------------------------------------------------------------------------
def _override_get_db():
    session = TestSessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _override_get_conn():
    with test_engine.connect() as conn:
        yield conn


app.dependency_overrides[get_db] = _override_get_db
app.dependency_overrides[get_conn] = _override_get_conn


# ---------------------------------------------------------------------------
# Known fixture constants (shared across test modules)
# ---------------------------------------------------------------------------
STAFF_USERNAME = "test_staff"
ADMIN_USERNAME = "test_admin"
MANAGER_USERNAME = "test_manager"
TEST_PASSWORD = "testpass123"

# Barcodes seeded for BOM name resolution tests
BOM_RAW_BARCODE = "FIXTURE_RAW_001"
BOM_FINISHED_BARCODE = "FIXTURE_FIN_001"
BOM_RAW_NAME = "Fixture Raw Material"
BOM_FINISHED_NAME = "Fixture Finished Good"


# ---------------------------------------------------------------------------
# Session fixture — truncate + seed once per pytest run
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def seed_test_db():
    with test_engine.begin() as conn:
        # Truncate in FK-safe order (product_bom refs users)
        conn.execute(text("""
            TRUNCATE TABLE
                app.product_bom,
                app.product_bom_suggestions,
                app.users
            CASCADE
        """))
        conn.execute(text("TRUNCATE TABLE raw.raw_sales_itemwise"))
        conn.execute(text("""
            TRUNCATE TABLE
                derived.customer_dimension,
                derived.customer_metrics,
                derived.product_health_signals,
                derived.daily_sales_summary,
                derived.daily_purchase_summary,
                derived.product_daily_metrics,
                derived.product_stock_position
        """))

        # ── Users ──────────────────────────────────────────────────────────
        pw = hash_password(TEST_PASSWORD)
        conn.execute(text("""
            INSERT INTO app.users (username, full_name, hashed_password, role, is_active)
            VALUES
                (:u1, 'Test Staff',   :pw, 'staff',   TRUE),
                (:u2, 'Test Admin',   :pw, 'admin',   TRUE),
                (:u3, 'Test Manager', :pw, 'manager', TRUE)
        """), {"u1": STAFF_USERNAME, "u2": ADMIN_USERNAME, "u3": MANAGER_USERNAME, "pw": pw})

        # ── Raw rows for BOM name resolution ──────────────────────────────
        batch_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO raw.raw_sales_itemwise
                (import_batch_id, source_file_name, barcode, item_name_raw, sale_qty)
            VALUES
                (:bid, 'fixture.csv', :raw_bc, :raw_name, 10),
                (:bid, 'fixture.csv', :fin_bc, :fin_name, 5)
        """), {
            "bid": batch_id,
            "raw_bc": BOM_RAW_BARCODE,
            "raw_name": BOM_RAW_NAME,
            "fin_bc": BOM_FINISHED_BARCODE,
            "fin_name": BOM_FINISHED_NAME,
        })

        # ── Customer dimension — 4 tiers + walk-in ─────────────────────────
        conn.execute(text("""
            INSERT INTO derived.customer_dimension
                (mobile_clean, display_name, is_walk_in, is_member,
                 first_seen_date, last_seen_date, total_bills)
            VALUES
                ('9876540001', 'Active Customer',   FALSE, FALSE, '2025-01-01', CURRENT_DATE - 10, 5),
                ('9876540002', 'At-Risk Customer',  FALSE, TRUE,  '2025-01-01', CURRENT_DATE - 35, 3),
                ('9876540003', 'Lapsed Customer',   FALSE, FALSE, '2025-01-01', CURRENT_DATE - 65, 2),
                ('9876540004', 'Lost Customer',     FALSE, FALSE, '2025-01-01', CURRENT_DATE - 95, 1),
                ('WALK-IN',    'Walk-In',           TRUE,  FALSE, '2025-01-01', CURRENT_DATE,     100)
        """))

        # ── Customer metrics ───────────────────────────────────────────────
        conn.execute(text("""
            INSERT INTO derived.customer_metrics
                (mobile_clean, total_revenue, total_bills, avg_bill_value,
                 total_discount_received, last_purchase_date,
                 days_since_last_visit, avg_days_between_visits,
                 is_repeat, preferred_payment)
            VALUES
                ('9876540001',  5000, 5, 1000, 0, CURRENT_DATE - 10,  10, 7,    TRUE,  'upi'),
                ('9876540002',  3000, 3,  800, 0, CURRENT_DATE - 35,  35, 14,   TRUE,  'cash'),
                ('9876540003',  1500, 2,  750, 0, CURRENT_DATE - 65,  65, 30,   TRUE,  'card'),
                ('9876540004',   500, 1,  500, 0, CURRENT_DATE - 95,  95, NULL, TRUE,  'cash'),
                ('WALK-IN',   50000,100,  500, 0, CURRENT_DATE,        0, NULL, TRUE,  'cash')
        """))

        # ── Product health signals ─────────────────────────────────────────
        conn.execute(text("""
            INSERT INTO derived.product_health_signals
                (date, product_id, fast_moving_flag, slow_moving_flag,
                 dead_stock_flag, demand_spike_flag, predicted_daily_demand)
            VALUES
                (CURRENT_DATE - 1, 'FAST_PROD_001', TRUE,  FALSE, FALSE, FALSE, 10.5),
                (CURRENT_DATE - 1, 'DEAD_PROD_001', FALSE, FALSE, TRUE,  FALSE,  0.0)
        """))

        # ── Daily sales summary ────────────────────────────────────────────
        conn.execute(text("""
            INSERT INTO derived.daily_sales_summary
                (sale_date, total_bills, total_items_sold, total_revenue, avg_bill_value)
            VALUES
                (CURRENT_DATE - 1, 50, 200, 25000, 500),
                (CURRENT_DATE - 2, 45, 180, 22500, 500)
        """))

        # ── Daily purchase summary ─────────────────────────────────────────
        conn.execute(text("""
            INSERT INTO derived.daily_purchase_summary
                (purchase_date, total_purchase_bills, total_quantity_purchased,
                 total_taxable_value, total_settled_amount, total_due_amount)
            VALUES
                (CURRENT_DATE - 1, 5, 100, 15000, 12000, 3000),
                (CURRENT_DATE - 2, 4,  90, 13000, 13000,    0)
        """))

    yield


# ---------------------------------------------------------------------------
# Per-test fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def client(seed_test_db):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def staff_token(client):
    resp = client.post("/api/auth/login", json={"username": STAFF_USERNAME, "password": TEST_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture
def admin_token(client):
    resp = client.post("/api/auth/login", json={"username": ADMIN_USERNAME, "password": TEST_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture
def manager_token(client):
    resp = client.post("/api/auth/login", json={"username": MANAGER_USERNAME, "password": TEST_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture
def staff_headers(staff_token):
    return {"Authorization": f"Bearer {staff_token}"}


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def manager_headers(manager_token):
    return {"Authorization": f"Bearer {manager_token}"}

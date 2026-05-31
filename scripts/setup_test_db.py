"""One-time setup for axonflux_test database. Run once per machine, or when resetting the test DB.

Usage:
    python scripts/setup_test_db.py
"""
import os
import subprocess
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

USER = os.getenv("user")
PASSWORD = os.getenv("password", "")
HOST = os.getenv("host", "localhost")
PORT = os.getenv("port", "5432")
TEST_DB = "axonflux_test"
ROOT = Path(__file__).parents[1]


def run_sql_file(path: Path) -> None:
    env = {**os.environ, "PGPASSWORD": PASSWORD}
    result = subprocess.run(
        ["psql", "-U", USER, "-h", HOST, "-p", str(PORT), "-d", TEST_DB,
         "-v", "ON_ERROR_STOP=1", "-f", str(path)],
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"  FAILED: {path}")
        print(result.stderr[:1000])
        sys.exit(1)
    print(f"  OK {path.name}")


def main() -> None:
    conn = psycopg2.connect(
        user=USER, password=PASSWORD, host=HOST, port=int(PORT), dbname="postgres"
    )
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB,))
    if cur.fetchone():
        print(f"Database '{TEST_DB}' already exists.")
        answer = input("Drop and recreate? [y/N]: ").strip().lower()
        if answer != "y":
            print("Aborted.")
            sys.exit(0)
        cur.execute(f"DROP DATABASE {TEST_DB}")

    cur.execute(f"CREATE DATABASE {TEST_DB}")
    cur.close()
    conn.close()
    print(f"Created database: {TEST_DB}")

    print("\nCreating raw.* schema...")
    run_sql_file(ROOT / "sql" / "raw_tables.sql")

    print("\nCreating derived.* schema...")
    run_sql_file(ROOT / "sql" / "derived_tables.sql")

    # Rebuild SQL files create remaining derived tables (IF NOT EXISTS).
    # INSERT statements will produce 0 rows — raw tables are empty. Safe.
    print("\nCreating derived.* tables from rebuild scripts...")
    rebuild_dir = ROOT / "sql" / "rebuild_derived"
    for sql_file in sorted(rebuild_dir.glob("*.sql")):
        run_sql_file(sql_file)

    print("\nRunning Alembic migrations (app.* schema)...")
    os.environ["dbname"] = TEST_DB  # load_dotenv() in env.py won't override this
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(ROOT / "alembic.ini"))
    command.upgrade(cfg, "head")
    print("  OK alembic migrations")

    print(f"\nDone. axonflux_test is ready. Run: pytest tests/")


if __name__ == "__main__":
    main()

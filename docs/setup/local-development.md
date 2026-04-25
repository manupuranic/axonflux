# Local Development Setup

## Related Guides

- [Git & Remote Strategy](./git-strategy.md) — two-remote setup, what's safe to push, daily workflow
- [Demo Data Setup](./demo-data.md) — running a separate demo database alongside production

## Prerequisites

- Python 3.13+
- PostgreSQL running locally on port 5432
- Node.js 20+
- Git Bash (Windows) — all shell commands below use Unix syntax

## Fresh Machine Setup (with demo data)

All commands run from the **project root** (`axonflux/`). `PYTHONPATH=.` is required for any script that imports from `config/`, `db/`, `raw_ingestion/` etc.

---

### 1. Create `.env`

Create `.env` in the project root:

```
user=postgres
password=your_postgres_password
host=localhost
port=5432
dbname=axonflux
SECRET_KEY=generate-a-long-random-string-here
```

Generate `SECRET_KEY`:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

### 2. Install Python dependencies

```bash
pip install -r api/requirements.txt
```

The pipeline and API share the same virtualenv — no conflicts.

---

### 3. Create the database

```bash
createdb -U postgres axonflux
```

---

### 4. Create raw + derived schemas

`raw.*` and `derived.*` are not managed by Alembic — run once on a fresh database:

```bash
psql -U postgres -d axonflux -f sql/raw_tables.sql
psql -U postgres -d axonflux -f sql/derived_tables.sql
```

If you see errors and need to retry (e.g. after pulling a fix), drop and recreate:

```bash
psql -U postgres -d axonflux -c "DROP SCHEMA IF EXISTS raw CASCADE; DROP SCHEMA IF EXISTS derived CASCADE;"
psql -U postgres -d axonflux -f sql/raw_tables.sql
psql -U postgres -d axonflux -f sql/derived_tables.sql
```

---

### 5. Run app migrations

Creates `app.*` schema and all application tables:

```bash
alembic upgrade head
```

---

### 6. Generate demo data

Generates 6 months of synthetic FMCG sales + purchase data into `data/sample/`:

```bash
python scripts/generate_demo_data.py
```

Output:
- `data/sample/sales_itemwise/sales_itemwise_demo.csv`
- `data/sample/sales_billwise/sales_billwise_demo.csv`
- `data/sample/purchase_billwise/purchase_billwise_demo.csv`

---

### 7. Copy demo CSVs to incoming

```bash
mkdir -p data/incoming/sales_itemwise data/incoming/sales_billwise data/incoming/purchase_billwise
cp data/sample/sales_itemwise/sales_itemwise_demo.csv     data/incoming/sales_itemwise/
cp data/sample/sales_billwise/sales_billwise_demo.csv     data/incoming/sales_billwise/
cp data/sample/purchase_billwise/purchase_billwise_demo.csv data/incoming/purchase_billwise/
```

---

### 8. Run ingestion

Loads CSVs into `raw.*` tables:

```bash
PYTHONPATH=. python scripts/ingest_all.py
```

---

### 9. Install raw dedup triggers

Must run after ingestion (raw tables must exist first):

```bash
python scripts/setup_raw_triggers.py
```

---

### 10. Rebuild derived tables

Runs the full 10-step SQL pipeline:

```bash
PYTHONPATH=. python pipelines/weekly_pipeline.py
```

---

### 11. Create admin user

```bash
python scripts/create_admin.py
```

---

### 12. Install frontend dependencies

```bash
cd web && npm install
```

---

### 13. Start the stack

Two terminals from project root:

```bash
# Terminal 1 — API
python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
cd web && npm run dev
```

- API docs: http://localhost:8000/api/docs
- Dashboard: http://localhost:3000

---

## Process Ports

| Process | Port |
|---|---|
| PostgreSQL | 5432 |
| FastAPI (uvicorn) | 8000 |
| Next.js dev | 3000 |
| MLflow UI | 5001 |

---

## Accessing from Another Device on the Same WiFi

Find your machine's local IP:
```powershell
ipconfig   # look for IPv4 under WiFi adapter, e.g. 192.168.1.42
```

Edit `web/lib/api.ts`:
```typescript
const BASE = "http://192.168.1.42:8000";  // replace with your IP
```

Restart `npm run dev`. Access from other device at `http://192.168.1.42:3000`.

**Firewall:** Allow Python and Node.js incoming connections when prompted.

---

## Important Notes

- Run all commands from project root so Python resolves `from config.db import engine` etc.
- `PYTHONPATH=.` is required for pipeline scripts and `ingest_all.py`.
- Alembic only manages `app.*`. It never touches `raw.*` or `derived.*`.
- `raw.*` and `derived.*` schemas created by `sql/raw_tables.sql` and `sql/derived_tables.sql` respectively.

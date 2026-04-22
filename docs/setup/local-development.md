# Local Development Setup

## Prerequisites

- Python 3.13+
- PostgreSQL (running locally on port 5432)
- Node.js 20+ (for the Next.js frontend, when ready)
- The `.env` file in the project root with DB credentials

## First-Time Setup

### 1. Install API dependencies

```bash
# From project root
pip install -r api/requirements.txt
```

The pipeline's `requirements.txt` and the API's `requirements.txt` can share the same virtual environment. There are no conflicts.

### 2. Add SECRET_KEY to .env

Open `.env` and add:
```
SECRET_KEY=generate-a-long-random-string-here
```

Generate one with:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Run database migrations

Creates the `app.*` schema and all application tables. Safe to run on a live database — all DDL uses `IF NOT EXISTS`.

```bash
alembic upgrade head
```

### 4. Create the first admin user

```bash
python scripts/create_admin.py
```

(See `docs/architecture/api-layer.md` for the script content if it doesn't exist yet.)

### 5. Install frontend dependencies

```bash
cd web
npm install
```

### 6. Start the API

```bash
# From project root
python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/api/docs

### 7. Start the frontend (separate terminal)

```bash
cd web
npm run dev
```

Frontend: http://localhost:3000

## Process Ports

| Process | Port | Notes |
|---|---|---|
| PostgreSQL | 5432 | Existing, no change |
| FastAPI (uvicorn) | 8000 | `uvicorn api.main:app` |
| Next.js dev | 3000 | `npm run dev` in `web/` |
| MLflow UI | 5001 | `mlflow server ...` in `ml/` |

## Running the Full Stack (Production)

```bash
# Start all processes with PM2
pm2 start ecosystem.config.js
```

(Ecosystem config to be added in Phase 9.)

## Accessing from Other Devices on the Same WiFi

To access the web app from another device (phone, tablet, laptop) on the same WiFi network:

### Step 1: Find your machine's IP address

**Windows PowerShell:**
```powershell
ipconfig
# Look for IPv4 Address under your WiFi adapter (e.g., 192.168.x.x)
```

Or from the terminal:
```bash
hostname -I
```

Example: `192.168.1.42`

### Step 2: Update the API URL (one-time)

Edit `web/lib/api.ts` and change:
```typescript
const BASE = "http://localhost:8000";
```

To:
```typescript
const BASE = "http://192.168.1.42:8000";  // Replace with your actual IP
```

Then restart the Next.js dev server (`npm run dev`).

### Step 3: Access from another device

On the other device, open a browser and navigate to:
```
http://192.168.1.42:3000
```

Replace `192.168.1.42` with your actual IP address from Step 1.

### Tips

- **Firewall**: Ensure your Windows firewall allows Python and Node.js to accept incoming connections. You may get a prompt — click "Allow."
- **Static IP**: For consistent access, consider setting a static IP for your dev machine, or note the IP in a bookmark.
- **Testing**: From the same machine, you can test with `http://localhost:3000` (frontend) and `http://localhost:8000/api/docs` (API).
- **Mobile testing**: This is ideal for testing the dashboard on a tablet or phone on the same network.

## Important Notes

- Run all commands from the **project root** (`D:\projects\axonflux`) so that Python can resolve `from config.db import engine` etc.
- The existing pipeline scripts (`scripts/`, `pipelines/`) are completely unaffected. They run independently.
- Alembic only manages `app.*` tables. It will never touch `raw.*`, `derived.*`, or `recon.*`.

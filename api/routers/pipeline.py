import os
import subprocess
import sys
import threading
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.dependencies import get_db, require_admin
from api.models.app import AppPipelineRun
from api.schemas.auth import CurrentUser

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_PIPELINE_SCRIPT = _PROJECT_ROOT / "pipelines" / "weekly_pipeline.py"
_EXPORT_SCRIPT   = _PROJECT_ROOT / "scripts" / "er4u_export.py"
_INGEST_SCRIPT   = _PROJECT_ROOT / "scripts" / "ingest_all.py"

_LOG_FLUSH_EVERY = 15   # lines between DB flushes during live run


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_last_data_date() -> date | None:
    """Return the latest sale_date in derived.daily_sales_summary, or None."""
    from config.db import engine
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT MAX(sale_date) FROM derived.daily_sales_summary")
            ).fetchone()
            return row[0] if row and row[0] else None
    except Exception:
        pass
    # Fallback: parse from raw table (handles first-run before rebuild)
    try:
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT TO_TIMESTAMP(MAX(bill_datetime_raw), 'DD-MM-YYYYHH12:MI AM')::date "
                "FROM raw.raw_sales_billwise WHERE bill_datetime_raw IS NOT NULL"
            )).fetchone()
            return row[0] if row and row[0] else None
    except Exception:
        return None


def _flush_logs(run_id: str, lines: list[str]) -> None:
    """Write current log lines to the pipeline_run record."""
    from config.db import SessionLocal
    session = SessionLocal()
    try:
        run = session.query(AppPipelineRun).filter(AppPipelineRun.id == run_id).first()
        if run:
            run.log_output = "\n".join(lines)[-50_000:]  # cap at 50k chars
            session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


def _finish_run(run_id: str, status: str, lines: list[str]) -> None:
    from config.db import SessionLocal
    session = SessionLocal()
    try:
        run = session.query(AppPipelineRun).filter(AppPipelineRun.id == run_id).first()
        if run:
            run.status = status
            run.completed_at = datetime.now(timezone.utc)
            run.log_output = "\n".join(lines)[-50_000:]
            session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


def _stream_proc(cmd: list, cwd: Path, env: dict, on_line) -> int:
    """Run a subprocess, call on_line(str) for each stdout line. Returns exit code."""
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=str(cwd),
        env=env,
    )
    for raw in iter(proc.stdout.readline, ""):
        line = raw.rstrip()
        if line:
            on_line(line)
    proc.stdout.close()
    proc.wait()
    return proc.returncode


# ── Background tasks ───────────────────────────────────────────────────────────

def _run_full_refresh(run_id: str, days_to_export: int) -> None:
    """Export Er4u data → ingest → rebuild derived tables. Streams logs live."""
    lines: list[str] = []
    counter = [0]

    def emit(line: str) -> None:
        lines.append(line)
        counter[0] += 1
        if counter[0] % _LOG_FLUSH_EVERY == 0:
            _flush_logs(run_id, lines[:])

    base_env = {**os.environ, "PYTHONPATH": str(_PROJECT_ROOT)}

    # ── Step 1: Export ──────────────────────────────────────────────────────
    emit(f"[STEP 1/3] Exporting Er4u data — {days_to_export} day(s)...")
    export_env = {**base_env, "ER4U_EXPORT_DAYS": str(days_to_export)}
    rc = _stream_proc([sys.executable, str(_EXPORT_SCRIPT)], _PROJECT_ROOT, export_env, emit)
    _flush_logs(run_id, lines[:])
    if rc != 0:
        emit(f"[FAILED] Er4u export exited with code {rc}")
        _finish_run(run_id, "failed", lines)
        return

    # ── Step 2: Ingest ──────────────────────────────────────────────────────
    emit("\n[STEP 2/3] Ingesting exported files...")
    rc = _stream_proc([sys.executable, str(_INGEST_SCRIPT)], _PROJECT_ROOT, base_env, emit)
    _flush_logs(run_id, lines[:])
    if rc != 0:
        emit(f"[FAILED] Ingestion exited with code {rc}")
        _finish_run(run_id, "failed", lines)
        return

    # ── Step 3: Rebuild ─────────────────────────────────────────────────────
    emit("\n[STEP 3/3] Rebuilding derived tables...")
    rc = _stream_proc([sys.executable, str(_PIPELINE_SCRIPT)], _PROJECT_ROOT, base_env, emit)
    _flush_logs(run_id, lines[:])

    status = "success" if rc == 0 else "failed"
    if rc != 0:
        emit(f"[FAILED] Pipeline rebuild exited with code {rc}")
    else:
        emit("\n[DONE] All steps complete. Dashboard data is now fresh.")
    _finish_run(run_id, status, lines)


def _run_pipeline(run_id: str, run_ingestion: bool = False) -> None:
    """Existing pipeline background task (rebuild only / ingest+rebuild)."""
    lines: list[str] = []
    counter = [0]

    def emit(line: str) -> None:
        lines.append(line)
        counter[0] += 1
        if counter[0] % _LOG_FLUSH_EVERY == 0:
            _flush_logs(run_id, lines[:])

    base_env = {**os.environ, "PYTHONPATH": str(_PROJECT_ROOT)}
    cmd = [sys.executable, str(_PIPELINE_SCRIPT)]
    if run_ingestion:
        cmd.append("--run-ingestion")

    rc = _stream_proc(cmd, _PROJECT_ROOT, base_env, emit)
    _finish_run(run_id, "success" if rc == 0 else "failed", lines)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/full-refresh", status_code=202)
def trigger_full_refresh(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    """
    Export fresh data from Er4u, ingest it, then rebuild derived tables.
    Date range is calculated from the last ingested data date automatically.
    """
    last_date = _get_last_data_date()
    yesterday = date.today() - timedelta(days=1)

    if last_date is None:
        days_to_export = 30
    else:
        days_to_export = max((yesterday - last_date).days, 1)

    run = AppPipelineRun(
        triggered_by=current_user.id if current_user.id else None,
        triggered_at=datetime.now(timezone.utc),
        pipeline_type="full_refresh",
        status="running",
    )
    db.add(run)
    db.flush()
    run_id = str(run.id)
    db.commit()

    background_tasks.add_task(_run_full_refresh, run_id, days_to_export)

    return {
        "run_id": run_id,
        "status": "running",
        "days_to_export": days_to_export,
        "last_data_date": last_date.isoformat() if last_date else None,
    }


@router.post("/trigger", status_code=202)
def trigger_pipeline(
    background_tasks: BackgroundTasks,
    run_ingestion: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    """
    Trigger the weekly pipeline (rebuild only, or ingest + rebuild).
    """
    run = AppPipelineRun(
        triggered_by=current_user.id if current_user.id else None,
        triggered_at=datetime.now(timezone.utc),
        pipeline_type="weekly_full_with_ingestion" if run_ingestion else "weekly_full",
        status="running",
    )
    db.add(run)
    db.flush()
    run_id = str(run.id)
    db.commit()

    background_tasks.add_task(_run_pipeline, run_id, run_ingestion)
    return {"run_id": run_id, "status": "running"}


@router.get("/status/latest", response_model=dict | None)
def get_latest_pipeline_run(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    """Get the most recent pipeline run."""
    run = (
        db.query(AppPipelineRun)
        .order_by(AppPipelineRun.triggered_at.desc())
        .first()
    )
    if not run:
        return None
    return {
        "id": str(run.id),
        "triggered_at": run.triggered_at,
        "pipeline_type": run.pipeline_type,
        "status": run.status,
        "completed_at": run.completed_at,
        "log_output": run.log_output,
        "error_message": run.error_message,
    }


@router.get("/status/{run_id}", response_model=dict)
def get_pipeline_run(
    run_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    """Get a specific pipeline run by ID (used for live polling)."""
    from fastapi import HTTPException
    run = db.query(AppPipelineRun).filter(AppPipelineRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "id": str(run.id),
        "triggered_at": run.triggered_at,
        "pipeline_type": run.pipeline_type,
        "status": run.status,
        "completed_at": run.completed_at,
        "log_output": run.log_output,
        "error_message": run.error_message,
    }


@router.get("/status", response_model=list[dict])
def get_pipeline_status(
    limit: int = 10,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    """Get recent pipeline runs."""
    runs = (
        db.query(AppPipelineRun)
        .order_by(AppPipelineRun.triggered_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(r.id),
            "triggered_at": r.triggered_at,
            "pipeline_type": r.pipeline_type,
            "status": r.status,
            "completed_at": r.completed_at,
            "error_message": r.error_message,
        }
        for r in runs
    ]


@router.get("/last-data-date")
def get_last_data_date(
    _: CurrentUser = Depends(require_admin),
):
    """Return the latest data date in the system (for pre-flight info in the UI)."""
    last = _get_last_data_date()
    yesterday = date.today() - timedelta(days=1)
    days_behind = (yesterday - last).days if last else None
    return {
        "last_data_date": last.isoformat() if last else None,
        "days_behind": days_behind,
    }

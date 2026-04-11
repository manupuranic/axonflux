import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from api.dependencies import get_db, require_admin
from api.models.app import AppPipelineRun
from api.schemas.auth import CurrentUser

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

_PIPELINE_SCRIPT = Path(__file__).resolve().parents[3] / "pipelines" / "weekly_pipeline.py"


def _run_pipeline(run_id: str, script: Path, run_ingestion: bool = False) -> None:
    """Background task: executes the pipeline script and updates the run record."""
    from config.db import SessionLocal

    cmd = [sys.executable, str(script)]
    if run_ingestion:
        cmd.append("--run-ingestion")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(script.parent.parent),  # project root
    )

    session = SessionLocal()
    try:
        run = session.query(AppPipelineRun).filter(AppPipelineRun.id == run_id).first()
        if run:
            run.status = "success" if result.returncode == 0 else "failed"
            run.completed_at = datetime.now(timezone.utc)
            run.log_output = result.stdout[-10_000:] if result.stdout else None  # cap log size
            run.error_message = result.stderr[-5_000:] if result.stderr and result.returncode != 0 else None
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


@router.post("/trigger", status_code=202)
def trigger_pipeline(
    background_tasks: BackgroundTasks,
    run_ingestion: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    """
    Trigger the weekly pipeline.

    Query params:
    - run_ingestion (bool, default False): If true, run data ingestion from incoming files before rebuilding derived tables.
    """
    run = AppPipelineRun(
        triggered_by=current_user.id if current_user.id else None,
        triggered_at=datetime.now(timezone.utc),
        pipeline_type="weekly_full" if not run_ingestion else "weekly_full_with_ingestion",
        status="running",
    )
    db.add(run)
    db.flush()
    run_id = str(run.id)

    background_tasks.add_task(_run_pipeline, run_id, _PIPELINE_SCRIPT, run_ingestion)
    return {"run_id": run_id, "status": "running", "message": "Pipeline triggered"}


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

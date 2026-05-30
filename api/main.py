import time
from pathlib import Path

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.core.config import settings
from api.routers import auth, analytics, customers, products, suppliers, pipeline, docs
from api.agents.router import router as agents_router
from api.tools import register_tools, _registered_manifests, get_manifests
from api.tools.base import ToolManifest
from api.ai.config import ALLOWED_MODELS
from api.dependencies import get_current_user


app = FastAPI(
    title="AxonFlux API",
    description="Analytics, inventory intelligence, and internal staff tools for supermarket operations.",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ---------------------------------------------------------------------------
# CORS — allow Next.js dev server and local LAN dashboard
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Core routers (always present)
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(analytics.router)
app.include_router(customers.router)
app.include_router(products.router)
app.include_router(suppliers.router)
app.include_router(pipeline.router)
app.include_router(docs.router)
app.include_router(agents_router)

# ---------------------------------------------------------------------------
# Static file serving for local asset uploads (Phase 1 AssetService)
# ---------------------------------------------------------------------------
_uploads_dir = Path(__file__).parents[1] / "data" / "uploads"
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")
# /uploads alias — used by the campaign asset upload endpoint so the frontend
# can construct image URLs without knowing the /static prefix.
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads_alias")

# ---------------------------------------------------------------------------
# Tool plugin routers (auto-discovered)
# ---------------------------------------------------------------------------
registered = register_tools(app)
_registered_manifests.extend(registered)


# ---------------------------------------------------------------------------
# Global AI models endpoint — returns all models from the allowlist
# ---------------------------------------------------------------------------
@app.get("/api/ai/models", tags=["ai"])
def get_all_models():
    """Returns all allowed AI models grouped by provider."""
    return [
        {"provider": p, "model": m}
        for p, models in ALLOWED_MODELS.items()
        for m in models
    ]


# ---------------------------------------------------------------------------
# AI connection test endpoint
# ---------------------------------------------------------------------------
@app.post("/api/ai/test", tags=["ai"])
def test_ai_connection(body: dict, _=Depends(get_current_user)):
    """Sends a minimal message to the specified provider/model and reports latency."""
    from api.ai import ChatSession
    provider = body.get("provider", "anthropic")
    model = body.get("model", "")
    if not model:
        from api.ai.config import ALLOWED_MODELS
        model = ALLOWED_MODELS[provider][0]
    t0 = time.monotonic()
    try:
        session = ChatSession(provider=provider, model=model, system_prompt="", tools=[])
        result = session.send("Reply with exactly one word: OK")
        ms = int((time.monotonic() - t0) * 1000)
        return {"ok": True, "response": result.assistant_text, "latency_ms": ms, "provider": provider, "model": model}
    except Exception as e:
        ms = int((time.monotonic() - t0) * 1000)
        return {"ok": False, "error": str(e), "latency_ms": ms, "provider": provider, "model": model}


# ---------------------------------------------------------------------------
# Tool manifest endpoint — frontend reads this to know which tools exist
# ---------------------------------------------------------------------------
@app.get("/api/tools", tags=["tools"], response_model=list[dict])
def list_tools():
    """Returns registered tool manifests for dynamic sidebar/routing."""
    return [
        {
            "id": m.id,
            "name": m.name,
            "description": m.description,
            "icon": m.icon,
            "required_role": m.required_role,
            "tags": m.tags,
        }
        for m in get_manifests()
    ]


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok"}

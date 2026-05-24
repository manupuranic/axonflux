from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.core.config import settings
from api.routers import auth, analytics, customers, products, suppliers, pipeline, docs
from api.tools import register_tools, _registered_manifests, get_manifests
from api.tools.base import ToolManifest
from api.ai.config import ALLOWED_MODELS


@asynccontextmanager
async def lifespan(app: FastAPI):
    from api.tools.pamphlets.render.pdf import launch_browser, close_browser
    pw, browser = await launch_browser()
    app.state.playwright = pw
    app.state.browser = browser
    yield
    await close_browser(pw, browser)


app = FastAPI(
    lifespan=lifespan,
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

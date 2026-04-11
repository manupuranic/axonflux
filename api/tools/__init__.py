"""
Tool plugin registry.

Every subdirectory that contains both __init__.py (with a MANIFEST) and router.py
is automatically discovered and registered as a tool when register_tools() is called.

To add a new tool:
1. Create api/tools/<tool_name>/__init__.py  — declare MANIFEST
2. Create api/tools/<tool_name>/router.py    — define an APIRouter
3. That's it. No changes to main.py or this file.
"""

import importlib
from pathlib import Path

from fastapi import FastAPI

from api.tools.base import ToolManifest


def _discover_tools() -> list[tuple[ToolManifest, str]]:
    """Return list of (manifest, module_path) for every discovered tool plugin."""
    tools_dir = Path(__file__).parent
    found = []
    for tool_dir in sorted(tools_dir.iterdir()):
        if not tool_dir.is_dir() or tool_dir.name.startswith("_"):
            continue
        init_file = tool_dir / "__init__.py"
        router_file = tool_dir / "router.py"
        if init_file.exists() and router_file.exists():
            module_path = f"api.tools.{tool_dir.name}"
            try:
                mod = importlib.import_module(module_path)
                if hasattr(mod, "MANIFEST"):
                    found.append((mod.MANIFEST, f"{module_path}.router"))
            except ImportError:
                pass
    return found


def register_tools(app: FastAPI) -> list[ToolManifest]:
    """Mount all tool routers onto the FastAPI app. Returns registered manifests."""
    manifests = []
    for manifest, router_module_path in _discover_tools():
        router_mod = importlib.import_module(router_module_path)
        app.include_router(router_mod.router)
        manifests.append(manifest)
    return manifests


# Module-level registry (populated when register_tools is called)
_registered_manifests: list[ToolManifest] = []


def get_manifests() -> list[ToolManifest]:
    return _registered_manifests

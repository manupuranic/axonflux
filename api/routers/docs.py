"""
Serve markdown documentation files from the docs/ directory.
Provides a list endpoint and a content endpoint for the frontend doc browser.
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/documentation", tags=["docs"])

_DOCS_ROOT = Path(__file__).resolve().parents[2] / "docs"

# Categories to expose (subdirectories of docs/)
_CATEGORIES = {
    "architecture": "Architecture",
    "decisions": "Design Decisions",
}


@router.get("")
def list_docs():
    """Return all available docs grouped by category."""
    result = []
    for folder, label in _CATEGORIES.items():
        folder_path = _DOCS_ROOT / folder
        if not folder_path.is_dir():
            continue
        files = sorted(folder_path.glob("*.md"))
        for f in files:
            # Extract title from first # heading or use filename
            title = f.stem.replace("-", " ").replace("_", " ").title()
            content = f.read_text(encoding="utf-8")
            for line in content.splitlines():
                if line.startswith("# "):
                    title = line[2:].strip()
                    break

            result.append({
                "category": label,
                "slug": f"{folder}/{f.stem}",
                "filename": f.name,
                "title": title,
            })
    return result


@router.get("/{category}/{slug}")
def get_doc(category: str, slug: str):
    """Return markdown content for a specific doc."""
    if category not in _CATEGORIES:
        raise HTTPException(status_code=404, detail="Category not found")

    file_path = _DOCS_ROOT / category / f"{slug}.md"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")

    # Security: ensure resolved path is still under docs/
    if not file_path.resolve().is_relative_to(_DOCS_ROOT.resolve()):
        raise HTTPException(status_code=403, detail="Access denied")

    content = file_path.read_text(encoding="utf-8")
    return {"slug": f"{category}/{slug}", "content": content}

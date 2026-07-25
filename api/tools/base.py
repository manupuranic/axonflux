from dataclasses import dataclass, field


@dataclass
class ToolManifest:
    """Metadata every tool plugin must declare."""
    id: str                          # URL-safe slug, e.g. "cash-closure"
    name: str                        # Display name, e.g. "Cash Closure"
    description: str
    icon: str                        # Lucide icon name for the frontend
    tags: list[str] = field(default_factory=list)
    # No role field: access is declared per route with require_staff/manager/admin
    # (api/dependencies.py), and nav visibility lives in the sidebar's links array.
    # A role here would be read by nobody and would look like a guarantee it can't make.

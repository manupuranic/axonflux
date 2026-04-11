from dataclasses import dataclass, field


@dataclass
class ToolManifest:
    """Metadata every tool plugin must declare."""
    id: str                          # URL-safe slug, e.g. "cash-closure"
    name: str                        # Display name, e.g. "Cash Closure"
    description: str
    icon: str                        # Lucide icon name for the frontend
    required_role: str = "staff"     # "staff" or "admin"
    tags: list[str] = field(default_factory=list)

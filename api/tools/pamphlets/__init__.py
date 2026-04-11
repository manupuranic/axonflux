from api.tools.base import ToolManifest

MANIFEST = ToolManifest(
    id="pamphlets",
    name="Pamphlet Generator",
    description="Create and download print-ready promotional pamphlets with product offers.",
    icon="FileText",
    required_role="staff",
    tags=["marketing", "print"],
)

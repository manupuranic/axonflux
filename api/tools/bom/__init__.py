from api.tools.base import ToolManifest

MANIFEST = ToolManifest(
    id="bom",
    name="BOM Manager",
    description="Define raw material → finished product relationships for accurate stock position.",
    icon="FlaskConical",
    required_role="staff",
    tags=["inventory", "stock"],
)

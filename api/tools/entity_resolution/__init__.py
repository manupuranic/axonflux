from api.tools.base import ToolManifest

MANIFEST = ToolManifest(
    id="entity-resolution",
    name="Entity Resolution",
    description="Detect and merge duplicate barcodes — review RapidFuzz clusters and confirm canonical product identities.",
    icon="GitMerge",
    required_role="staff",
    tags=["data-quality", "products"],
)

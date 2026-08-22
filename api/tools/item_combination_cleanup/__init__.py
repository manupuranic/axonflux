from api.tools.base import ToolManifest

MANIFEST = ToolManifest(
    id="item-combination-cleanup",
    name="Item Combination Cleanup",
    description="Upload an ER4U Item Combination workbook, verify identity, and export a safe copy.",
    icon="FileSpreadsheet",
    tags=["data-quality", "er4u"],
)

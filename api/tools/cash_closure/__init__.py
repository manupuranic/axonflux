from api.tools.base import ToolManifest

MANIFEST = ToolManifest(
    id="cash-closure",
    name="Cash Closure",
    description="End-of-day cash reconciliation — compare physical counts against billing system totals.",
    icon="Wallet",
    required_role="staff",
    tags=["finance", "daily-ops"],
)

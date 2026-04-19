from api.tools.base import ToolManifest

MANIFEST = ToolManifest(
    id="cash-closure",
    name="Cash Closure",
    description="Daily Hand Over Take Over — record inside/outside counter, denominations, and cash difference.",
    icon="Wallet",
    required_role="staff",
    tags=["finance", "daily-ops"],
)

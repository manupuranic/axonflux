"""Er4u automated export script

Downloads the 4 daily report types from Er4u cloud POS and drops them into
data/incoming/{report_type}/ so that file_watcher.py picks them up and fires
the ingestion + rebuild pipeline automatically.

First-time setup
----------------
1. Add to .env:
       ER4U_URL=https://yourstore.er4u.in
       ER4U_USERNAME=your@email.com
       ER4U_PASSWORD=yourpassword
       ER4U_EXPORT_DAYS=1        # days back to export (default: 1 = yesterday)

2. Install Playwright browser (one-time):
       .venv\\Scripts\\python -m playwright install chromium

3. Test interactively (browser stays visible so you can inspect the UI):
       PYTHONPATH=. python scripts\\er4u_export.py --no-headless

4. Schedule via Windows Task Scheduler (daily at 22:00):
       Action: cmd /c "cd /d D:\\projects\\ledgerai && .venv\\Scripts\\python.exe
               scripts\\er4u_export.py >> logs\\er4u_export.log 2>&1"

Reports exported
----------------
- sales_billwise     bill-wise sale report    (.csv)
- sales_itemwise     item-wise sale report    (.xlsx)
- purchase_billwise  bill-wise purchase report (.csv)
- purchase_itemwise  item-wise purchase report (.csv)

Selector calibration
--------------------
Run with --no-headless and open DevTools (F12) to find the exact CSS selectors
or text for each navigation step. Update the SELECTORS dict below, then re-run
headlessly to verify. Selectors are text-based where possible so they survive
minor UI reskins.
"""

import argparse
import os
import sys
import shutil
import tempfile
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Page, Download, TimeoutError as PlaywrightTimeout

load_dotenv()

# ── Configuration ──────────────────────────────────────────────────────────────

ER4U_URL      = os.getenv("ER4U_URL", "").rstrip("/")
ER4U_USERNAME = os.getenv("ER4U_USERNAME", "")
ER4U_PASSWORD = os.getenv("ER4U_PASSWORD", "")
ER4U_EXPORT_DAYS = int(os.getenv("ER4U_EXPORT_DAYS", "1"))

INCOMING_DIR = Path("data/incoming")

# ── Selector map ───────────────────────────────────────────────────────────────
# Update these after inspecting the Er4u UI with --no-headless.
# Prefer text selectors (getByText / getByRole) — they survive minor UI changes.
# Fall back to CSS only when text is ambiguous.
#
# How to find them: open --no-headless, open DevTools (F12), hover over each
# element, right-click → Copy → Copy selector.

SELECTORS: dict[str, str] = {
    # Login page
    "username_input":   'input[type="text"], input[name="username"], input[placeholder*="User"]',
    "password_input":   'input[type="password"]',
    "login_button":     'button[type="submit"], button:has-text("Login"), button:has-text("Sign In")',

    # Main nav — update with actual menu text from Er4u
    "reports_menu":     'a:has-text("Reports"), span:has-text("Reports"), li:has-text("Reports")',

    # Report sub-menu items — update with exact link text shown in Er4u
    "bill_wise_sale":        'a:has-text("Bill Wise Sale"), a:has-text("Billwise Sale")',
    "item_wise_sale":        'a:has-text("Item Wise Sale"), a:has-text("Itemwise Sale")',
    "bill_wise_purchase":    'a:has-text("Bill Wise Purchase"), a:has-text("Billwise Purchase")',
    "item_wise_purchase":    'a:has-text("Item Wise Purchase"), a:has-text("Itemwise Purchase")',

    # Date inputs — Er4u typically uses date pickers or plain <input type="date">
    "date_from":        'input[placeholder*="From"], input[name*="from"], input[id*="from"]',
    "date_to":          'input[placeholder*="To"], input[name*="to"], input[id*="to"]',

    # Export / Download trigger
    "export_button":    'button:has-text("Export"), button:has-text("Download"), a:has-text("Export CSV"), a:has-text("Export Excel")',

    # Optional: "Go" / "Search" button to load report before export
    "search_button":    'button:has-text("Go"), button:has-text("Search"), button:has-text("Show")',
}

# Maps Er4u report menu selectors → local report type folder name + expected file ext
REPORT_CONFIGS = [
    {
        "name":        "sales_billwise",
        "nav_selector": "bill_wise_sale",
        "ext":          ".csv",
    },
    {
        "name":        "sales_itemwise",
        "nav_selector": "item_wise_sale",
        "ext":          ".xlsx",
    },
    {
        "name":        "purchase_billwise",
        "nav_selector": "bill_wise_purchase",
        "ext":          ".csv",
    },
    {
        "name":        "purchase_itemwise",
        "nav_selector": "item_wise_purchase",
        "ext":          ".csv",
    },
]


# ── Helpers ────────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    print(msg, flush=True)


def validate_config() -> None:
    missing = [k for k, v in [
        ("ER4U_URL", ER4U_URL),
        ("ER4U_USERNAME", ER4U_USERNAME),
        ("ER4U_PASSWORD", ER4U_PASSWORD),
    ] if not v]
    if missing:
        log(f"[ERROR] Missing .env keys: {', '.join(missing)}")
        log("        Add them to .env and re-run.")
        sys.exit(1)


def date_range() -> tuple[date, date]:
    end   = date.today() - timedelta(days=1)          # yesterday
    start = end - timedelta(days=ER4U_EXPORT_DAYS - 1)
    return start, end


def format_date_for_input(d: date) -> str:
    """DD/MM/YYYY — most Indian POS systems use this format in date pickers."""
    return d.strftime("%d/%m/%Y")


# ── Login ──────────────────────────────────────────────────────────────────────

def login(page: Page) -> None:
    log(f"[LOGIN] Navigating to {ER4U_URL}")
    page.goto(ER4U_URL, wait_until="networkidle", timeout=30_000)

    # Fill username
    try:
        page.locator(SELECTORS["username_input"]).first.fill(ER4U_USERNAME)
    except PlaywrightTimeout:
        raise RuntimeError(
            "Could not find username input. Update SELECTORS['username_input'] "
            "by running with --no-headless and inspecting the login form."
        )

    page.locator(SELECTORS["password_input"]).first.fill(ER4U_PASSWORD)
    page.locator(SELECTORS["login_button"]).first.click()

    # Wait for navigation away from login page
    try:
        page.wait_for_url(lambda url: url != ER4U_URL, timeout=15_000)
        log("[LOGIN] Success.")
    except PlaywrightTimeout:
        raise RuntimeError(
            "Login did not redirect after 15s — check credentials or update "
            "the login selectors."
        )


# ── Report export ──────────────────────────────────────────────────────────────

def export_report(
    page: Page,
    report_name: str,
    nav_selector_key: str,
    date_from: date,
    date_to: date,
    dest_dir: Path,
    ext: str,
) -> bool:
    """Navigate to a report, set dates, trigger download, save to dest_dir.
    Returns True on success, False on skippable failure.
    """
    log(f"\n[EXPORT] {report_name}  {date_from} → {date_to}")

    # Navigate to Reports menu
    try:
        page.locator(SELECTORS["reports_menu"]).first.click()
        page.wait_for_timeout(800)
    except PlaywrightTimeout:
        log(f"[WARN]  Could not find Reports menu. Update SELECTORS['reports_menu'].")
        return False

    # Click the specific report
    nav_sel = SELECTORS.get(nav_selector_key, "")
    if not nav_sel:
        log(f"[WARN]  No selector configured for {nav_selector_key}. Skipping.")
        return False

    try:
        page.locator(nav_sel).first.click()
        page.wait_for_load_state("networkidle", timeout=15_000)
    except PlaywrightTimeout:
        log(f"[WARN]  Could not navigate to {report_name}. Check selector: {nav_sel}")
        return False

    # Set date range
    str_from = format_date_for_input(date_from)
    str_to   = format_date_for_input(date_to)

    try:
        from_input = page.locator(SELECTORS["date_from"]).first
        from_input.triple_click()
        from_input.fill(str_from)

        to_input = page.locator(SELECTORS["date_to"]).first
        to_input.triple_click()
        to_input.fill(str_to)
    except PlaywrightTimeout:
        log(f"[WARN]  Could not set date range for {report_name}. Check date selectors.")
        return False

    # Click Search/Go if present (load the report before exporting)
    try:
        search_btn = page.locator(SELECTORS["search_button"]).first
        if search_btn.is_visible(timeout=2_000):
            search_btn.click()
            page.wait_for_load_state("networkidle", timeout=15_000)
    except PlaywrightTimeout:
        pass  # No search button — some reports auto-load

    # Trigger download
    filename = f"{report_name}_{date_from.strftime('%Y%m%d')}_{date_to.strftime('%Y%m%d')}{ext}"
    dest_path = dest_dir / filename

    try:
        with page.expect_download(timeout=30_000) as dl_info:
            page.locator(SELECTORS["export_button"]).first.click()
        download: Download = dl_info.value
    except PlaywrightTimeout:
        log(f"[WARN]  Download did not start for {report_name}. "
            "Check SELECTORS['export_button'].")
        return False

    # Save to a temp path first, then move atomically
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp_path = Path(tmp.name)

    download.save_as(str(tmp_path))
    dest_dir.mkdir(parents=True, exist_ok=True)
    shutil.move(str(tmp_path), str(dest_path))

    log(f"[OK]    Saved → {dest_path}")
    return True


# ── Main ───────────────────────────────────────────────────────────────────────

def main(headless: bool = True) -> None:
    validate_config()

    date_from, date_to = date_range()
    log(f"[START] Er4u export  {date_from} → {date_to}  (headless={headless})")

    results: dict[str, bool] = {}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)
        context = browser.new_context(accept_downloads=True)
        page    = context.new_page()

        try:
            login(page)
        except RuntimeError as e:
            log(f"[ERROR] {e}")
            browser.close()
            sys.exit(1)

        for cfg in REPORT_CONFIGS:
            dest = INCOMING_DIR / cfg["name"]
            # Retry once on failure
            ok = export_report(
                page,
                cfg["name"],
                cfg["nav_selector"],
                date_from,
                date_to,
                dest,
                cfg["ext"],
            )
            if not ok:
                log(f"[RETRY] Retrying {cfg['name']}...")
                ok = export_report(
                    page,
                    cfg["name"],
                    cfg["nav_selector"],
                    date_from,
                    date_to,
                    dest,
                    cfg["ext"],
                )
            results[cfg["name"]] = ok

        browser.close()

    # Summary
    log("\n[SUMMARY] ─────────────────────────────")
    passed = [k for k, v in results.items() if v]
    failed = [k for k, v in results.items() if not v]
    for r in passed:
        log(f"  ✓ {r}")
    for r in failed:
        log(f"  ✗ {r}  (skipped — check selectors)")
    log("────────────────────────────────────────")

    if failed:
        log(f"\n[WARN] {len(failed)} report(s) failed. "
            "file_watcher will still ingest any files that did land.")
        sys.exit(0)  # Non-fatal — watcher handles partial drops

    log(f"\n[DONE] All {len(passed)} reports downloaded. "
        "file_watcher will ingest and rebuild in ~15s.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Er4u automated export")
    parser.add_argument(
        "--no-headless",
        action="store_true",
        help="Show browser window (use for first-time selector calibration)",
    )
    args = parser.parse_args()
    main(headless=not args.no_headless)

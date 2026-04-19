"""Er4u automated export script

Downloads 4 daily report types from Er4u cloud POS and drops them into
data/incoming/{report_type}/ so that file_watcher.py picks them up and fires
the ingestion + rebuild pipeline automatically.

First-time setup
----------------
1. Add to .env:
       ER4U_URL=https://er4uenterprise.in/er4u/puranichealth/index.php
       ER4U_USERNAME=your_username
       ER4U_PASSWORD=your_password
       ER4U_EXPORT_DAYS=1        # days back to export (default: 1 = yesterday)

2. Install Playwright browser (one-time):
       .venv\\Scripts\\python -m playwright install chromium

3. Test interactively:
       PYTHONPATH=. python scripts\\er4u_export.py --no-headless

4. Schedule via Windows Task Scheduler (daily at 22:00):
       Action: cmd /c "cd /d D:\\projects\\ledgerai && .venv\\Scripts\\python.exe
               scripts\\er4u_export.py >> logs\\er4u_export.log 2>&1"

Er4u export flow (two-step)
----------------------------
Er4u uses a filter page -> results page pattern. The correct sequence is:

  1. Navigate to report page (report_sale.php or report_purchase.php)
  2. Select Report Type in the chosen.js dropdown
  3. Set sdate / edate fields via jQuery (YYYY/MM/DD)
  4. For sales reports: ensure "With Return" checkbox is checked
  5. Click View button (input#button1) — form submits to the results page
  6. Wait for DataTables to render on the results page
  7. Click `button.buttons-csv` to trigger the CSV download

Date chunking: to avoid server timeouts on large date ranges, dates are
split into chunks of CHUNK_DAYS (default: 2). Each chunk is exported as a
separate file; file_watcher deduplicates via SHA-256 on ingest.

Report configs
--------------
  sales_billwise   -> report_sale.php     -> report_type=report_sale1.php      (Bill Wise)
  sales_itemwise   -> report_sale.php     -> report_type=report_itemsale1.php  (Item Wise)
  purchase_billwise-> report_purchase.php -> report_type=report_purchase1.php  (Bill Wise)
  purchase_itemwise-> report_purchase.php -> report_type=report_itempurchase1.php (Item Wise)

All reports download as CSV from the DataTables CSV button.
"""

import argparse
import os
import sys
import shutil
import tempfile
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ER4U_URL         = os.getenv("ER4U_URL", "https://er4uenterprise.in/er4u/puranichealth/index.php").rstrip("/")
ER4U_USERNAME    = os.getenv("ER4U_USERNAME", "")
ER4U_PASSWORD    = os.getenv("ER4U_PASSWORD", "")
ER4U_EXPORT_DAYS = int(os.getenv("ER4U_EXPORT_DAYS", "1"))

BASE_URL     = "https://er4uenterprise.in/er4u/puranichealth"
INCOMING_DIR = Path("data/incoming")
STAGING_DIR  = Path("data/staging")   # used with --staging flag
CHUNK_DAYS   = 2   # split date range into N-day chunks to avoid server timeout


REPORT_CONFIGS = [
    {
        "name":         "sales_billwise",
        "page":         "report_sale.php",
        "report_type":  "report_sale1.php",
        "with_return":  True,
        "dl_selector":  "button.buttons-csv",   # billwise has CSV button
        "xlsx_to_csv":  False,
    },
    {
        "name":         "sales_itemwise",
        "page":         "report_sale.php",
        "report_type":  "report_itemsale1.php",
        "with_return":  True,
        "dl_selector":  "button.buttons-excel", # itemwise has only Excel button
        "xlsx_to_csv":  False,  # ingest_all.read_sales_itemwise handles xlsx natively
    },
    {
        "name":         "purchase_billwise",
        "page":         "report_purchase.php",
        "report_type":  "report_purchase1.php",
        "with_return":  False,
        "dl_selector":  "button.buttons-excel", # assume Excel; update if CSV exists
        "xlsx_to_csv":  True,
    },
    {
        "name":         "purchase_itemwise",
        "page":         "report_purchase.php",
        "report_type":  "report_itempurchase1.php",
        "with_return":  False,
        "dl_selector":  "button.buttons-excel", # assume Excel; update if CSV exists
        "xlsx_to_csv":  True,
    },
]


# ── Helpers ────────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    print(msg, flush=True)


def validate_config() -> None:
    missing = [k for k, v in [("ER4U_USERNAME", ER4U_USERNAME), ("ER4U_PASSWORD", ER4U_PASSWORD)] if not v]
    if missing:
        log(f"[ERROR] Missing .env keys: {', '.join(missing)}")
        sys.exit(1)


def date_range() -> tuple[date, date]:
    end   = date.today() - timedelta(days=1)
    start = end - timedelta(days=ER4U_EXPORT_DAYS - 1)
    return start, end


def date_chunks(date_from: date, date_to: date, chunk_days: int = CHUNK_DAYS) -> list[tuple[date, date]]:
    """Split [date_from, date_to] into chunks of at most chunk_days each."""
    chunks = []
    cur = date_from
    while cur <= date_to:
        chunk_end = min(cur + timedelta(days=chunk_days - 1), date_to)
        chunks.append((cur, chunk_end))
        cur = chunk_end + timedelta(days=1)
    return chunks


def convert_xlsx_to_csv(xlsx_path: Path) -> Path:
    """Convert XLSX to CSV in-place. Returns new .csv path.

    All Er4u Excel exports have 2 banner rows (store name + report title)
    before the real column headers on row 3. skiprows=2 skips them so the
    resulting CSV has proper headers that match each ingestion module's HEADER_MAP.
    """
    import pandas as pd
    csv_path = xlsx_path.with_suffix(".csv")
    df = pd.read_excel(xlsx_path, engine="openpyxl", skiprows=2, header=0)
    df.to_csv(csv_path, index=False)
    xlsx_path.unlink()
    log(f"         Converted XLSX -> CSV: {csv_path.name}")
    return csv_path


def set_date_field(page, field_name: str, value: str) -> None:
    """Set a jQuery datepicker text field by direct DOM assignment + change event."""
    page.evaluate(
        f"""
        var el = document.querySelector('input[name="{field_name}"]');
        el.value = "{value}";
        if (typeof $ !== 'undefined') {{
            $(el).trigger('change');
        }} else {{
            el.dispatchEvent(new Event('change', {{bubbles: true}}));
        }}
        """
    )


def set_chosen_select(page, field_name: str, value: str) -> None:
    """Set a chosen.js select and refresh the widget. Falls back to native events."""
    page.evaluate(
        f"""
        var el = document.querySelector('select[name="{field_name}"]');
        el.value = '{value}';
        el.dispatchEvent(new Event('change', {{bubbles: true}}));
        if (typeof $ !== 'undefined') {{
            $(el).trigger('chosen:updated').trigger('change');
        }}
        """
    )


# ── Login ──────────────────────────────────────────────────────────────────────

def login(page) -> None:
    log(f"[LOGIN] {ER4U_URL}")
    page.goto(ER4U_URL, wait_until="load", timeout=30_000)

    page.locator('input[name="txtUserName"]').fill(ER4U_USERNAME)
    page.locator('input[name="txtPassword"]').fill(ER4U_PASSWORD)
    page.locator('button[name="submit2"]').click()

    # Wait for ALL post-login redirects to finish.
    # Strategy: wait for the login form to disappear (login page unloaded),
    # then keep polling until the URL is stable and not on the login page.
    try:
        # Wait for the username field to disappear — means we left the login page
        page.wait_for_selector('input[name="txtUserName"]', state="hidden", timeout=20_000)
    except Exception:
        pass

    # Wait for any outstanding redirects/JS navigation to settle
    try:
        page.wait_for_load_state("networkidle", timeout=15_000)
    except Exception:
        pass

    page.wait_for_timeout(2000)  # extra buffer for PHP session to be written

    # Verify we are NOT on the login page
    if page.locator('input[name="txtUserName"]').count() > 0:
        raise RuntimeError("Login failed — check ER4U_USERNAME / ER4U_PASSWORD in .env")

    log(f"[LOGIN] OK  ({page.url})")


# ── Export one chunk ───────────────────────────────────────────────────────────

def export_chunk(page, cfg: dict, date_from: date, date_to: date, dest_base: Path = INCOMING_DIR) -> Path | None:
    """
    Navigate to the filter page, set options, click View, then download CSV
    from the DataTables results page. Returns saved path or None on failure.
    """
    name     = cfg["name"]
    page_url = f"{BASE_URL}/{cfg['page']}"

    log(f"  [CHUNK] {name}  {date_from} -> {date_to}")

    # Use domcontentloaded to avoid net::ERR_ABORTED on server-side redirects.
    # If session expired, server will redirect to login — we catch that below.
    try:
        page.goto(page_url, wait_until="domcontentloaded", timeout=20_000)
    except Exception:
        page.wait_for_timeout(2000)

    # Detect login redirect — session may have expired mid-run
    if page.locator('input[name="txtUserName"]').count() > 0:
        log("  [WARN]  Session expired mid-run — re-logging in...")
        login(page)
        try:
            page.goto(page_url, wait_until="domcontentloaded", timeout=20_000)
        except Exception:
            page.wait_for_timeout(2000)

    # Wait for the report form to be ready (proves we're authenticated and on right page).
    # The native <select> is hidden by chosen.js — use state="attached" not default "visible".
    try:
        page.wait_for_selector('select[name="report_type"]', state="attached", timeout=10_000)
    except Exception as e:
        log(f"  [WARN]  Report form not found after navigation: {e}")
        return None

    # Set Report Type via chosen.js dropdown
    set_chosen_select(page, "report_type", cfg["report_type"])
    page.wait_for_timeout(400)

    # Set dates
    sdate = date_from.strftime("%Y/%m/%d")
    edate = date_to.strftime("%Y/%m/%d")
    set_date_field(page, "sdate", sdate)
    set_date_field(page, "edate", edate)
    page.wait_for_timeout(300)

    # Check "With Return" for sales
    if cfg["with_return"]:
        page.evaluate(
            """
            var cb = document.querySelector('input[name="with_return"]');
            if (cb && !cb.checked) cb.click();
            """
        )

    # Click View button and wait for results page to load
    try:
        page.locator("input#button1").click()
        # Results page URL will contain the report_type filename.
        # Use glob string (not lambda) — Python 3.13 IOCP event loop crashes on
        # Playwright lambda callbacks via greenlet async bridge on Windows.
        results_pattern = cfg["report_type"].replace(".php", "")
        page.wait_for_url(f"**{results_pattern}**", timeout=60_000)
        # Wait for DataTables export buttons to appear after table renders
        page.wait_for_selector(cfg["dl_selector"], timeout=60_000)
        page.wait_for_timeout(500)
    except Exception as e:
        log(f"  [WARN]  Results page did not load: {e}")
        return None

    dest_dir = dest_base / name
    dest_dir.mkdir(parents=True, exist_ok=True)

    try:
        with page.expect_download(timeout=40_000) as dl_info:
            page.locator(cfg["dl_selector"]).first.click()
        download = dl_info.value
    except Exception as e:
        log(f"  [WARN]  Download did not start: {e}")
        return None

    suggested = download.suggested_filename or f"{name}_{date_from.strftime('%Y%m%d')}_{date_to.strftime('%Y%m%d')}.csv"
    suffix    = Path(suggested).suffix or ".csv"
    tmp_path  = Path(tempfile.mktemp(suffix=suffix))
    download.save_as(str(tmp_path))

    final_name = f"{name}_{date_from.strftime('%Y%m%d')}_{date_to.strftime('%Y%m%d')}{suffix}"
    dest_path  = dest_dir / final_name
    shutil.move(str(tmp_path), str(dest_path))

    if cfg.get("xlsx_to_csv"):
        dest_path = convert_xlsx_to_csv(dest_path)

    log(f"  [OK]    -> {dest_path}")
    return dest_path


# ── Export one report (all chunks) ────────────────────────────────────────────

def export_report(page, cfg: dict, date_from: date, date_to: date, dest_base: Path = INCOMING_DIR) -> bool:
    """Export all date chunks for one report type. Returns True if all chunks succeeded."""
    name   = cfg["name"]
    chunks = date_chunks(date_from, date_to)
    log(f"\n[EXPORT] {name}  ({date_from} -> {date_to}, {len(chunks)} chunk(s))")

    all_ok = True
    for chunk_from, chunk_to in chunks:
        result = export_chunk(page, cfg, chunk_from, chunk_to, dest_base=dest_base)
        if result is None:
            log(f"  [RETRY] {chunk_from} -> {chunk_to}...")
            result = export_chunk(page, cfg, chunk_from, chunk_to, dest_base=dest_base)
        if result is None:
            log(f"  [FAIL]  chunk {chunk_from} -> {chunk_to} skipped")
            all_ok = False

    return all_ok


# ── Main ───────────────────────────────────────────────────────────────────────

def main(headless: bool = True, staging: bool = False) -> None:
    validate_config()

    from playwright.sync_api import sync_playwright

    dest_base = STAGING_DIR if staging else INCOMING_DIR
    date_from, date_to = date_range()
    mode_label = "STAGING (verify before ingesting)" if staging else "INCOMING (auto-ingest via file_watcher)"
    log(f"[START] Er4u export  {date_from} -> {date_to}  (headless={headless}, dest={mode_label})")

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
            results[cfg["name"]] = export_report(page, cfg, date_from, date_to, dest_base=dest_base)

        browser.close()

    log("\n[SUMMARY] ─────────────────────────────")
    for name, ok in results.items():
        log(f"  {'✓' if ok else '✗'} {name}")
    log("────────────────────────────────────────")

    failed = [k for k, v in results.items() if not v]
    if failed:
        log(f"\n[WARN] {len(failed)} report(s) had failures. file_watcher will ingest any files that did land.")
    else:
        log(f"\n[DONE] All {len(results)} reports downloaded. file_watcher triggers in ~15s.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Er4u automated export")
    parser.add_argument("--no-headless", action="store_true", help="Show browser window")
    parser.add_argument("--staging", action="store_true",
                        help="Save to data/staging/ instead of data/incoming/ (no auto-ingest)")
    args = parser.parse_args()
    main(headless=not args.no_headless, staging=args.staging)

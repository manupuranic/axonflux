from __future__ import annotations
import asyncio
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=1)

# A4 landscape at 96dpi: 297mm × 210mm ≈ 1123 × 794px
_A4_W_PX = 1123
_A4_H_PX = 794


def _render_pdf_sync(html: str) -> bytes:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            ctx = browser.new_context()
            page = ctx.new_page()
            page.set_content(html, wait_until="domcontentloaded", timeout=15000)
            return page.pdf(
                print_background=True,
                format="A4",
                landscape=True,
                margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
            )
        finally:
            browser.close()


def _render_image_sync(html: str) -> bytes:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            ctx = browser.new_context(viewport={"width": _A4_W_PX, "height": _A4_H_PX})
            page = ctx.new_page()
            page.set_content(html, wait_until="networkidle", timeout=20000)
            return page.screenshot(full_page=True, type="png")
        finally:
            browser.close()


async def render_html_to_pdf(html: str, browser=None) -> bytes:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _render_pdf_sync, html)


async def render_html_to_image(html: str) -> bytes:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _render_image_sync, html)

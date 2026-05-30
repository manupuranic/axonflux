from __future__ import annotations
import asyncio
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=1)

# A4 landscape at 96dpi: 297mm × 210mm ≈ 1123 × 794px
# Kept as module constants for backward compatibility; not used inside functions anymore.
_A4_W_PX = 1123
_A4_H_PX = 794


def _render_pdf_sync(html: str, width_mm: float = 297, height_mm: float = 210) -> bytes:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            ctx = browser.new_context()
            page = ctx.new_page()
            page.set_content(html, wait_until="domcontentloaded", timeout=15000)
            return page.pdf(
                print_background=True,
                width=f"{width_mm}mm",
                height=f"{height_mm}mm",
                margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
            )
        finally:
            browser.close()


def _render_image_sync(html: str, scale: int = 2, width_px: int = 1122, height_px: int = 794) -> bytes:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            # device_scale_factor=2 → 2x resolution; use scale=3 for print-quality output
            ctx = browser.new_context(
                viewport={"width": width_px, "height": height_px},
                device_scale_factor=scale,
            )
            page = ctx.new_page()
            page.set_content(html, wait_until="networkidle", timeout=20000)
            return page.screenshot(full_page=True, type="png")
        finally:
            browser.close()


async def render_html_to_pdf(html: str, width_mm: float = 297, height_mm: float = 210) -> bytes:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _executor, lambda: _render_pdf_sync(html, width_mm, height_mm)
    )


async def render_html_to_image(html: str, scale: int = 2, width_px: int = 1122, height_px: int = 794) -> bytes:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _executor, lambda: _render_image_sync(html, scale, width_px, height_px)
    )

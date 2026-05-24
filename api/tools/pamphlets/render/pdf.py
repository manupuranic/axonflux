from __future__ import annotations
import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.async_api import Browser

_render_count = 0
_RELAUNCH_EVERY = 100


async def render_html_to_pdf(html: str, browser: "Browser") -> bytes:
    global _render_count
    _render_count += 1
    ctx = await browser.new_context()
    page = await ctx.new_page()
    try:
        await page.set_content(html, wait_until="networkidle", timeout=15000)
        pdf_bytes = await page.pdf(
            print_background=True,
            format="A4",
            landscape=True,
            margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
        )
    finally:
        await ctx.close()
    return pdf_bytes


async def launch_browser():
    from playwright.async_api import async_playwright
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
    return pw, browser


async def close_browser(pw, browser):
    await browser.close()
    await pw.stop()

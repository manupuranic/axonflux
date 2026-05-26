from __future__ import annotations
import os
from urllib.parse import urlparse

import httpx

from api.ai.tools import tool, Tool


def build_infra_tools() -> list[Tool]:

    @tool(
        description=(
            "Search the web using Tavily. Returns results with title, url, content snippet, "
            "and an 'images' list of direct image URLs. "
            "Set include_images=true when looking for product photos."
        ),
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "num_results": {"type": "integer", "default": 5},
                "include_images": {"type": "boolean", "default": False},
            },
            "required": ["query"],
        },
    )
    def web_search(query: str, num_results: int = 5, include_images: bool = False) -> dict:
        api_key = os.environ.get("TAVILY_API_KEY", "")
        resp = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "include_images": include_images,
                "max_results": num_results,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "results": [
                {"title": r.get("title"), "url": r.get("url"), "content": r.get("content", "")[:300]}
                for r in data.get("results", [])
            ],
            "images": data.get("images", []),
        }

    @tool(
        description=(
            "Fetch the contents of a URL via HTTP GET. "
            "Returns JSON if response is JSON (e.g. Open Food Facts API), otherwise returns text. "
            "Use for barcode lookups: fetch_url('https://world.openfoodfacts.org/api/v0/product/{barcode}.json'). "
            "The OFF response has product.image_front_url and product.image_url."
        ),
        parameters={
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        },
    )
    def fetch_url(url: str) -> dict:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return {"error": "Only http/https URLs are allowed"}
        resp = httpx.get(url, follow_redirects=True, timeout=15)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "json" in content_type:
            return {"json": resp.json()}
        return {"text": resp.text[:2000], "content_type": content_type}

    return [web_search, fetch_url]

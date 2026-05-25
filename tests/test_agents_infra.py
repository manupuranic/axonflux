from unittest.mock import patch, MagicMock
from api.agents.tools.infra import build_infra_tools


def test_web_search_calls_tavily():
    tools = build_infra_tools()
    web_search = next(t for t in tools if t.name == "web_search")

    mock_resp = MagicMock()
    mock_resp.raise_for_status = lambda: None
    mock_resp.json.return_value = {
        "results": [{"title": "Sugar 1kg", "url": "https://example.com/sugar", "content": "..."}],
        "images": ["https://example.com/sugar.jpg"],
    }

    with patch("httpx.post", return_value=mock_resp) as mock_post:
        result = web_search.func(query="Sugar 1kg product", num_results=3)

    mock_post.assert_called_once()
    call_json = mock_post.call_args.kwargs["json"]
    assert call_json["query"] == "Sugar 1kg product"
    assert call_json["max_results"] == 3
    assert len(result["results"]) == 1
    assert result["images"] == ["https://example.com/sugar.jpg"]


def test_fetch_url_returns_json():
    tools = build_infra_tools()
    fetch_url = next(t for t in tools if t.name == "fetch_url")

    mock_resp = MagicMock()
    mock_resp.raise_for_status = lambda: None
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json.return_value = {"product": {"image_front_url": "https://img.com/sugar.jpg"}}

    with patch("httpx.get", return_value=mock_resp):
        result = fetch_url.func(url="https://world.openfoodfacts.org/api/v0/product/8901030012345.json")

    assert result["json"]["product"]["image_front_url"] == "https://img.com/sugar.jpg"

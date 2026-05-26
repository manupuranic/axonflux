from unittest.mock import patch, MagicMock
import asyncio


def test_find_image_uses_agent_with_name_and_barcode():
    mock_turn = MagicMock()
    mock_turn.assistant_text = "https://images.openfoodfacts.org/images/products/sugar.jpg"
    mock_turn.tool_executions = []

    with patch("api.agents.image_agent.ChatSession") as MockSession:
        instance = MockSession.return_value
        instance.send.return_value = mock_turn

        from api.agents.image_agent import find_image_for_product
        result = asyncio.get_event_loop().run_until_complete(
            find_image_for_product("Sugar 1kg", barcode="8901030012345", category="grocery", unit="1kg")
        )

    assert result == "https://images.openfoodfacts.org/images/products/sugar.jpg"
    sent_msg = instance.send.call_args[0][0]
    assert "Sugar 1kg" in sent_msg
    assert "8901030012345" in sent_msg


def test_find_image_returns_none_on_not_found():
    mock_turn = MagicMock()
    mock_turn.assistant_text = "I searched but could not find an image. NOT_FOUND"

    with patch("api.agents.image_agent.ChatSession") as MockSession:
        instance = MockSession.return_value
        instance.send.return_value = mock_turn

        from api.agents.image_agent import find_image_for_product
        result = asyncio.get_event_loop().run_until_complete(
            find_image_for_product("Unknown XYZ Product", barcode=None, category=None, unit=None)
        )

    assert result is None


def test_start_scan_task_creates_task():
    from api.agents.image_agent import start_scan_task, get_task

    with patch("api.agents.image_agent._run_scan_thread"):
        task_id = start_scan_task("pamphlet-123", [], lambda: None)

    task = get_task(task_id)
    assert task is not None
    assert task.pamphlet_id == "pamphlet-123"

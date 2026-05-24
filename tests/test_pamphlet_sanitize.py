from api.tools.pamphlets.render.validator import sanitize_html, sanitize_svg


def test_sanitize_html_strips_script():
    result = sanitize_html('<p>Hello</p><script>alert(1)</script>')
    assert "<script>" not in result
    assert "Hello" in result


def test_sanitize_html_keeps_allowed_tags():
    result = sanitize_html('<p>Hello <b>World</b></p>')
    assert "<b>" in result


def test_sanitize_svg_strips_script():
    result = sanitize_svg('<svg><circle r="10"/><script>alert(1)</script></svg>')
    assert "<script>" not in result
    assert "circle" in result


def test_sanitize_svg_strips_onload():
    result = sanitize_svg('<svg><image onload="evil()"/></svg>')
    assert "onload" not in result

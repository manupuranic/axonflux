import bleach
from lxml import etree

_ALLOWED_HTML_TAGS = [
    "p", "div", "span", "b", "i", "u", "strong", "em", "br",
    "img", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4",
    "table", "tr", "td", "th",
]
_ALLOWED_HTML_ATTRS = {
    "*": ["style", "class"],
    "img": ["src", "alt", "width", "height"],
    "a": ["href"],
}

_ALLOWED_SVG_TAGS = {
    "svg", "g", "path", "circle", "rect", "ellipse", "line",
    "polyline", "polygon", "text", "tspan", "defs", "use",
    "symbol", "clipPath", "mask", "linearGradient", "radialGradient",
    "stop", "filter", "feGaussianBlur", "title", "desc",
}
_FORBIDDEN_SVG_TAGS = {
    "script", "foreignObject", "animate", "animateTransform",
    "animateMotion", "set",
}


def sanitize_html(html: str) -> str:
    return bleach.clean(
        html,
        tags=_ALLOWED_HTML_TAGS,
        attributes=_ALLOWED_HTML_ATTRS,
        strip=True,
    )


def sanitize_svg(svg: str) -> str:
    try:
        root = etree.fromstring(svg.encode())
    except Exception:
        return ""
    _clean_svg_element(root)
    return etree.tostring(root, encoding="unicode")


def _clean_svg_element(el: etree._Element) -> None:
    tag = etree.QName(el.tag).localname if "}" in el.tag else el.tag
    if tag in _FORBIDDEN_SVG_TAGS:
        el.getparent().remove(el)
        return
    for attr in list(el.attrib.keys()):
        local = attr.split("}")[-1] if "}" in attr else attr
        if local.startswith("on") or local in ("href", "xlink:href"):
            del el.attrib[attr]
    for child in list(el):
        _clean_svg_element(child)

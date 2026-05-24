import json
from pathlib import Path

_THEMES_DIR = Path(__file__).parent
_CACHE: dict[str, dict] = {}

PRESET_IDS = ["minimal_light", "minimal_dark", "monsoon", "diwali", "summer"]


def load_theme(theme_id: str) -> dict:
    if theme_id not in _CACHE:
        path = _THEMES_DIR / f"{theme_id}.json"
        if not path.exists():
            raise KeyError(f"Unknown theme: {theme_id!r}")
        _CACHE[theme_id] = json.loads(path.read_text())
    return _CACHE[theme_id]


def list_themes() -> list[dict]:
    return [load_theme(tid) for tid in PRESET_IDS]


def apply_overrides(theme: dict, overrides: dict) -> dict:
    import copy
    merged = copy.deepcopy(theme)
    tokens = merged.setdefault("tokens", {})
    for section, values in overrides.items():
        tokens.setdefault(section, {}).update(values)
    return merged

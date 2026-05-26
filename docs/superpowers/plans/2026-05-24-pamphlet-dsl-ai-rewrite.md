# Pamphlet DSL + AI Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-grid pamphlet generator with a chat-driven, LLM-mutated DSL pamphlet editor. LLMs emit structured tool calls that mutate a JSON DSL tree; the same DSL renders to HTML for live preview and to PDF via Playwright. Multi-provider AI (Anthropic + OpenAI + OpenRouter) lives in a new global `api/ai/` module reusable by other features.

**Architecture:**
- LLM communicates via pydantic-validated tool calls only — never emits JSX or raw code
- Same HTML render path drives both web iframe preview and Puppeteer-printed PDF
- Pamphlet DSL stored as JSONB on `app.pamphlets`, every assistant turn snapshots a new row in `app.pamphlet_versions`, chat persisted in `app.pamphlet_chat_messages`
- Global `api/ai/` module exposes `ChatSession` + `@tool` decorator; pamphlets is its first consumer, existing highlight-gen endpoint refactored onto it

**Tech Stack:**
- Backend: FastAPI, SQLAlchemy, Alembic (migration 009), Playwright (Chromium, in-process), `bleach` (HTML sanitize), `lxml` (SVG sanitize), `anthropic` SDK, `openai` SDK (for both OpenAI direct + OpenRouter via `base_url`)
- Frontend: Next.js 14 App Router (existing), iframe `srcDoc` preview, SSE EventSource for streaming chat, shadcn/ui components already in repo
- DB: PostgreSQL `app.*` schema additions only — `derived.*` untouched

---

## File Structure

### New files

```
api/ai/                                          # NEW global AI module
├── __init__.py                                  # exports ChatSession, tool
├── provider.py                                  # AIProvider ABC + Message/ToolCall/ToolResult dataclasses
├── providers/
│   ├── __init__.py
│   ├── anthropic.py                             # AnthropicProvider
│   └── openai.py                                # OpenAIProvider — also serves OpenRouter via base_url
├── tools.py                                     # @tool decorator + Tool dataclass + JSON-schema gen
├── chat.py                                      # ChatSession — runs the agentic loop server-side
├── cost.py                                      # token → USD per model
├── config.py                                    # ALLOWED_MODELS, default provider/model, key loader
└── persistence.py                               # generic helpers to load/save chat rows (table-agnostic)

api/tools/pamphlets/                             # MODIFIED (stays in tool-plugin system)
├── ai_session.py                                # NEW — builds ChatSession with pamphlet system prompt
├── ai_tools.py                                  # NEW — @tool functions (set_theme, insert_node, ...)
├── render/
│   ├── __init__.py
│   ├── primitives.py                            # pydantic models per node type (page, section, ...)
│   ├── validator.py                             # tree validation + escape-hatch sanitizers
│   ├── html.py                                  # DSL → complete HTML string
│   └── pdf.py                                   # HTML → PDF bytes via Playwright
├── themes/
│   ├── monsoon.json
│   ├── diwali.json
│   ├── summer.json
│   ├── minimal_light.json
│   └── minimal_dark.json
└── system_prompt.py                             # NEW — pamphlet-editor LLM system prompt + few-shot examples

api/migrations/versions/
└── 009_pamphlet_dsl.py                          # NEW Alembic migration

web/app/(internal)/tools/pamphlet-generator/[id]/
├── page.tsx                                     # REWRITE — new editor (chat + iframe + history)
└── legacy/
    └── page.tsx                                 # MOVE existing page here (preserve old UI for legacy pamphlets)

web/components/pamphlet/
├── ChatPanel.tsx                                # NEW — message list + input + model dropdown
├── PreviewIframe.tsx                            # NEW — iframe srcDoc renderer
├── HistoryDrawer.tsx                            # NEW — versions list, restore button
├── ModelDropdown.tsx                            # NEW — provider/model picker
├── ToolCallPill.tsx                             # NEW — inline status pill per tool call
└── RawDslEditor.tsx                             # NEW — Monaco JSON editor (power user tab)

web/lib/pamphlet/
├── api.ts                                       # NEW — typed API client for new endpoints
└── types.ts                                     # NEW — DSL types mirroring pydantic primitives

scripts/
└── migrate_pamphlets_to_dsl.py                  # NEW — convert legacy → DSL pamphlets

tests/
├── test_ai_module.py                            # NEW — ChatSession, providers, tool decorator
├── test_pamphlet_primitives.py                  # NEW — pydantic validation of DSL tree
├── test_pamphlet_render_html.py                 # NEW — HTML render snapshot tests
├── test_pamphlet_ai_tools.py                    # NEW — each tool mutates DSL correctly
├── test_pamphlet_pdf.py                         # NEW — Playwright render produces valid PDF
└── test_pamphlet_sanitize.py                    # NEW — custom_html/raw_svg sanitizer
```

### Modified files

```
api/tools/pamphlets/models.py                    # add PamphletVersion, PamphletChatMessage models; extend Pamphlet
api/tools/pamphlets/schemas.py                   # add ChatRequest, ChatResponse, VersionResponse schemas
api/tools/pamphlets/router.py                    # add /chat, /versions, /export-pdf endpoints; keep existing
api/tools/pamphlets/service.py                   # add DSL/version/chat persistence helpers
api/tools/pamphlets/ai.py                        # refactor highlight gen to use new ChatSession
api/main.py                                      # Playwright lifecycle hooks (startup/shutdown)
requirements.txt                                 # add playwright, bleach, lxml, openai
web/components/pamphlet/PamphletItemCard.tsx     # adjust for DSL mode (kept for legacy)
web/components/pamphlet/PamphletItemEditModal.tsx# kept for legacy
.env.example                                     # add ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, AI_DEFAULT_PROVIDER, AI_DEFAULT_MODEL
```

---

## Phase 1 — Backend foundation

Tasks 1–12. Goal: full backend (AI module, DSL, renderer, PDF, 4 tools, 1 theme, schema, endpoints). Smoke-testable via curl.

### Task 1: Alembic migration 009 — DSL + versions + chat tables

**Files:**
- Create: `api/migrations/versions/009_pamphlet_dsl.py`

- [ ] **Step 1: Write the migration**

```python
"""009_pamphlet_dsl

Revision ID: 009_pamphlet_dsl
Revises: 008_product_bom
Create Date: 2026-05-24 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "009_pamphlet_dsl"
down_revision = "008_product_bom"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "pamphlets",
        sa.Column("template_dsl", JSONB, nullable=True),
        schema="app",
    )
    op.add_column(
        "pamphlets",
        sa.Column("theme", JSONB, nullable=True),
        schema="app",
    )
    op.add_column(
        "pamphlets",
        sa.Column("current_version_id", UUID(as_uuid=True), nullable=True),
        schema="app",
    )

    op.create_table(
        "pamphlet_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("pamphlet_id", UUID(as_uuid=True), nullable=False),
        sa.Column("template_dsl", JSONB, nullable=False),
        sa.Column("theme", JSONB, nullable=False),
        sa.Column("parent_version_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("edit_summary", sa.Text, nullable=True),
        sa.ForeignKeyConstraint(["pamphlet_id"], ["app.pamphlets.id"], ondelete="CASCADE"),
        schema="app",
    )
    op.create_index(
        "ix_pamphlet_versions_pamphlet_created",
        "pamphlet_versions",
        ["pamphlet_id", "created_at"],
        schema="app",
    )

    op.create_table(
        "pamphlet_chat_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("pamphlet_id", UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.Text, nullable=False),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("tool_call_name", sa.Text, nullable=True),
        sa.Column("tool_call_args", JSONB, nullable=True),
        sa.Column("tool_call_result", JSONB, nullable=True),
        sa.Column("version_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.Text, nullable=True),
        sa.Column("model", sa.Text, nullable=True),
        sa.Column("prompt_tokens", sa.Integer, nullable=True),
        sa.Column("completion_tokens", sa.Integer, nullable=True),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.ForeignKeyConstraint(["pamphlet_id"], ["app.pamphlets.id"], ondelete="CASCADE"),
        schema="app",
    )
    op.create_index(
        "ix_pamphlet_chat_pamphlet_created",
        "pamphlet_chat_messages",
        ["pamphlet_id", "created_at"],
        schema="app",
    )

    op.alter_column("pamphlets", "rows", nullable=True, schema="app")
    op.alter_column("pamphlets", "cols", nullable=True, schema="app")


def downgrade():
    op.drop_index("ix_pamphlet_chat_pamphlet_created", "pamphlet_chat_messages", schema="app")
    op.drop_table("pamphlet_chat_messages", schema="app")
    op.drop_index("ix_pamphlet_versions_pamphlet_created", "pamphlet_versions", schema="app")
    op.drop_table("pamphlet_versions", schema="app")
    op.drop_column("pamphlets", "current_version_id", schema="app")
    op.drop_column("pamphlets", "theme", schema="app")
    op.drop_column("pamphlets", "template_dsl", schema="app")
    op.alter_column("pamphlets", "rows", nullable=False, schema="app")
    op.alter_column("pamphlets", "cols", nullable=False, schema="app")
```

- [ ] **Step 2: Run migration**

Run: `alembic upgrade head`
Expected: `INFO  [alembic.runtime.migration] Running upgrade 008_product_bom -> 009_pamphlet_dsl`

- [ ] **Step 3: Verify schema**

Run: `psql -U postgres -d axonflux -c "\d app.pamphlet_versions"`
Expected: table exists with `template_dsl JSONB NOT NULL`, FK on `pamphlet_id`.

- [ ] **Step 4: Commit**

```bash
git add api/migrations/versions/009_pamphlet_dsl.py
git commit -m "feat(db): migration 009 — pamphlet DSL, versions, chat tables"
```

---

### Task 2: SQLAlchemy models for new tables

**Files:**
- Modify: `api/tools/pamphlets/models.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_pamphlet_models_smoke.py`:

```python
from api.tools.pamphlets.models import Pamphlet, PamphletVersion, PamphletChatMessage


def test_models_have_expected_columns():
    assert "template_dsl" in Pamphlet.__table__.columns
    assert "theme" in Pamphlet.__table__.columns
    assert "current_version_id" in Pamphlet.__table__.columns
    assert PamphletVersion.__tablename__ == "pamphlet_versions"
    assert PamphletChatMessage.__tablename__ == "pamphlet_chat_messages"
    assert "cost_usd" in PamphletChatMessage.__table__.columns
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_pamphlet_models_smoke.py -v`
Expected: FAIL with `ImportError: cannot import name 'PamphletVersion'`.

- [ ] **Step 3: Extend models**

Replace `api/tools/pamphlets/models.py` with:

```python
import uuid

from sqlalchemy import Boolean, Column, Date, Integer, Numeric, Text, TIMESTAMP, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB

from api.models.app import AppBase


class Pamphlet(AppBase):
    __tablename__ = "pamphlets"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(Text, nullable=False)
    template_type = Column(Text, nullable=False, default="sale_offer")
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(TIMESTAMP(timezone=True))
    valid_from = Column(Date)
    valid_until = Column(Date)
    is_published = Column(Boolean, default=False)
    rows = Column(Integer, nullable=True)
    cols = Column(Integer, nullable=True)
    template_dsl = Column(JSONB, nullable=True)
    theme = Column(JSONB, nullable=True)
    current_version_id = Column(UUID(as_uuid=True), nullable=True)


class PamphletItem(AppBase):
    __tablename__ = "pamphlet_items"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pamphlet_id = Column(UUID(as_uuid=True), nullable=False)
    barcode = Column(Text)
    display_name = Column(Text)
    offer_price = Column(Numeric)
    original_price = Column(Numeric)
    highlight_text = Column(Text)
    sort_order = Column(Integer, default=0)
    image_url = Column(Text)


class PamphletVersion(AppBase):
    __tablename__ = "pamphlet_versions"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pamphlet_id = Column(UUID(as_uuid=True), ForeignKey("app.pamphlets.id", ondelete="CASCADE"), nullable=False)
    template_dsl = Column(JSONB, nullable=False)
    theme = Column(JSONB, nullable=False)
    parent_version_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(UUID(as_uuid=True), nullable=True)
    edit_summary = Column(Text, nullable=True)


class PamphletChatMessage(AppBase):
    __tablename__ = "pamphlet_chat_messages"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pamphlet_id = Column(UUID(as_uuid=True), ForeignKey("app.pamphlets.id", ondelete="CASCADE"), nullable=False)
    role = Column(Text, nullable=False)
    content = Column(Text, nullable=True)
    tool_call_name = Column(Text, nullable=True)
    tool_call_args = Column(JSONB, nullable=True)
    tool_call_result = Column(JSONB, nullable=True)
    version_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    user_id = Column(UUID(as_uuid=True), nullable=True)
    provider = Column(Text, nullable=True)
    model = Column(Text, nullable=True)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    cost_usd = Column(Numeric(10, 6), nullable=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_pamphlet_models_smoke.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/tools/pamphlets/models.py tests/test_pamphlet_models_smoke.py
git commit -m "feat(pamphlets): add PamphletVersion + PamphletChatMessage models, extend Pamphlet with DSL columns"
```

---

### Task 3: Install new Python dependencies

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Install and freeze new deps**

Run: `pip install playwright bleach lxml openai`
Run: `playwright install chromium`

- [ ] **Step 2: Add to requirements.txt**

Add these lines to `requirements.txt`:
```
playwright>=1.44.0
bleach>=6.1.0
lxml>=5.2.0
openai>=1.30.0
```

- [ ] **Step 3: Verify playwright works**

Run: `python -c "from playwright.sync_api import sync_playwright; p = sync_playwright().start(); b = p.chromium.launch(); b.close(); p.stop(); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add requirements.txt
git commit -m "chore(deps): add playwright, bleach, lxml, openai for DSL pamphlet rewrite"
```

---

### Task 4: `api/ai/` config + cost calculator

**Files:**
- Create: `api/ai/__init__.py`
- Create: `api/ai/config.py`
- Create: `api/ai/cost.py`
- Create: `tests/test_ai_config.py`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ai_config.py
import pytest

from api.ai.config import ALLOWED_MODELS, get_default_provider, get_default_model, is_model_allowed
from api.ai.cost import calculate_cost


def test_allowed_models_has_three_providers():
    assert "anthropic" in ALLOWED_MODELS
    assert "openai" in ALLOWED_MODELS
    assert "openrouter" in ALLOWED_MODELS


def test_default_provider_and_model():
    assert get_default_provider() in ALLOWED_MODELS
    assert get_default_model() in ALLOWED_MODELS[get_default_provider()]


def test_is_model_allowed_rejects_unknown():
    assert is_model_allowed("anthropic", "claude-sonnet-4-6") is True
    assert is_model_allowed("anthropic", "claude-opus-99") is False
    assert is_model_allowed("unknown-provider", "x") is False


def test_calculate_cost_anthropic_sonnet():
    cost = calculate_cost("anthropic", "claude-sonnet-4-6", prompt_tokens=1000, completion_tokens=500)
    assert cost > 0
    assert isinstance(cost, float)


def test_calculate_cost_unknown_model_returns_zero():
    cost = calculate_cost("anthropic", "claude-unicorn", prompt_tokens=1000, completion_tokens=500)
    assert cost == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ai_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.ai'`.

- [ ] **Step 3: Create `api/ai/__init__.py`**

```python
from api.ai.chat import ChatSession
from api.ai.tools import tool, Tool

__all__ = ["ChatSession", "tool", "Tool"]
```

- [ ] **Step 4: Create `api/ai/config.py`**

```python
import os

ALLOWED_MODELS: dict[str, list[str]] = {
    "anthropic": [
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
    ],
    "openrouter": [
        "anthropic/claude-sonnet-4-6",
        "openai/gpt-4o",
        "meta-llama/llama-3.1-70b-instruct",
        "deepseek/deepseek-chat",
    ],
}


def get_default_provider() -> str:
    return os.environ.get("AI_DEFAULT_PROVIDER", "anthropic")


def get_default_model() -> str:
    provider = get_default_provider()
    fallback = ALLOWED_MODELS[provider][0]
    return os.environ.get("AI_DEFAULT_MODEL", fallback)


def is_model_allowed(provider: str, model: str) -> bool:
    return model in ALLOWED_MODELS.get(provider, [])


def get_api_key(provider: str) -> str:
    env_var = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }[provider]
    return os.environ[env_var]
```

- [ ] **Step 5: Create `api/ai/cost.py`**

```python
# USD per million tokens (prompt, completion)
_PRICING: dict[str, dict[str, tuple[float, float]]] = {
    "anthropic": {
        "claude-opus-4-7": (15.0, 75.0),
        "claude-sonnet-4-6": (3.0, 15.0),
        "claude-haiku-4-5-20251001": (1.0, 5.0),
    },
    "openai": {
        "gpt-4o": (2.5, 10.0),
        "gpt-4o-mini": (0.15, 0.6),
        "gpt-4-turbo": (10.0, 30.0),
    },
    "openrouter": {
        "anthropic/claude-sonnet-4-6": (3.0, 15.0),
        "openai/gpt-4o": (2.5, 10.0),
        "meta-llama/llama-3.1-70b-instruct": (0.5, 0.75),
        "deepseek/deepseek-chat": (0.14, 0.28),
    },
}


def calculate_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = _PRICING.get(provider, {}).get(model)
    if not pricing:
        return 0.0
    p_rate, c_rate = pricing
    return round(
        (prompt_tokens * p_rate + completion_tokens * c_rate) / 1_000_000,
        6,
    )
```

- [ ] **Step 6: Append to `.env.example`**

```
# AI providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENROUTER_API_KEY=
AI_DEFAULT_PROVIDER=anthropic
AI_DEFAULT_MODEL=claude-sonnet-4-6
```

- [ ] **Step 7: Run test to verify it passes**

Run: `python -m pytest tests/test_ai_config.py -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/ai/__init__.py api/ai/config.py api/ai/cost.py tests/test_ai_config.py .env.example
git commit -m "feat(ai): config + cost calculator for global AI module"
```

---

### Task 5: AI provider ABC + message types

**Files:**
- Create: `api/ai/provider.py`
- Create: `api/ai/providers/__init__.py`

- [ ] **Step 1: Write failing test** (create `tests/test_ai_module.py`)

```python
from api.ai.provider import Message, ToolCall, ToolResult

def test_message_defaults():
    m = Message(role="user", content="hello")
    assert m.tool_calls == []
    assert m.tool_results == []

def test_tool_call():
    tc = ToolCall(id="tc1", name="set_theme", arguments={"name": "monsoon"})
    assert tc.name == "set_theme"

def test_tool_result_default_not_error():
    tr = ToolResult(tool_call_id="tc1", name="set_theme", result={"ok": True})
    assert tr.is_error is False
```

- [ ] **Step 2: Run — expect fail**

Run: `python -m pytest tests/test_ai_module.py -v`
Expected: `ModuleNotFoundError: No module named 'api.ai.provider'`

- [ ] **Step 3: Create `api/ai/provider.py`**

```python
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ToolResult:
    tool_call_id: str
    name: str
    result: Any
    is_error: bool = False


@dataclass
class Message:
    role: str  # "user" | "assistant"
    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)


@dataclass
class CompletionResult:
    message: Message
    prompt_tokens: int
    completion_tokens: int


class AIProvider(ABC):
    @abstractmethod
    def complete(self, messages: list[Message], system: str, tools: list, model: str) -> CompletionResult: ...
```

- [ ] **Step 4: Create `api/ai/providers/__init__.py`** (empty file)

- [ ] **Step 5: Run — expect pass**

Run: `python -m pytest tests/test_ai_module.py -v`

- [ ] **Step 6: Commit**

```bash
git add api/ai/provider.py api/ai/providers/__init__.py tests/test_ai_module.py
git commit -m "feat(ai): provider ABC + Message/ToolCall/ToolResult dataclasses"
```

---

### Task 6: `@tool` decorator

**Files:**
- Create: `api/ai/tools.py`

- [ ] **Step 1: Append to `tests/test_ai_module.py`**

```python
from api.ai.tools import tool, Tool

def test_tool_decorator():
    @tool(
        description="Apply theme.",
        parameters={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}
    )
    def set_theme(name: str) -> dict:
        return {"applied": name}

    assert isinstance(set_theme, Tool)
    assert set_theme.name == "set_theme"
    assert set_theme.func(name="monsoon") == {"applied": "monsoon"}
```

- [ ] **Step 2: Run — expect fail**

Run: `python -m pytest tests/test_ai_module.py::test_tool_decorator -v`

- [ ] **Step 3: Create `api/ai/tools.py`**

```python
from __future__ import annotations
from dataclasses import dataclass
from typing import Callable


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict  # JSON Schema object
    func: Callable


def tool(description: str, parameters: dict):
    """Decorator factory — converts a function into a Tool with explicit JSON schema."""
    def decorator(func: Callable) -> Tool:
        return Tool(name=func.__name__, description=description, parameters=parameters, func=func)
    return decorator
```

- [ ] **Step 4: Run — expect pass**

Run: `python -m pytest tests/test_ai_module.py -v`

- [ ] **Step 5: Commit**

```bash
git add api/ai/tools.py tests/test_ai_module.py
git commit -m "feat(ai): @tool decorator with explicit JSON schema"
```

---

### Task 7: Anthropic + OpenAI/OpenRouter providers

**Files:**
- Create: `api/ai/providers/anthropic.py`
- Create: `api/ai/providers/openai.py`

- [ ] **Step 1: Create `api/ai/providers/anthropic.py`**

```python
import anthropic as sdk
from api.ai.provider import AIProvider, Message, ToolCall, CompletionResult
from api.ai.config import get_api_key
from api.ai.tools import Tool


class AnthropicProvider(AIProvider):
    def __init__(self):
        self._client: sdk.Anthropic | None = None

    def _get_client(self) -> sdk.Anthropic:
        if not self._client:
            self._client = sdk.Anthropic(api_key=get_api_key("anthropic"))
        return self._client

    def complete(self, messages: list[Message], system: str, tools: list[Tool], model: str) -> CompletionResult:
        sdk_msgs = []
        for msg in messages:
            if msg.role == "user" and msg.tool_results:
                content: list = []
                if msg.content:
                    content.append({"type": "text", "text": msg.content})
                for tr in msg.tool_results:
                    content.append({
                        "type": "tool_result",
                        "tool_use_id": tr.tool_call_id,
                        "content": str(tr.result),
                        "is_error": tr.is_error,
                    })
                sdk_msgs.append({"role": "user", "content": content})
            elif msg.role == "assistant" and msg.tool_calls:
                content = []
                if msg.content:
                    content.append({"type": "text", "text": msg.content})
                for tc in msg.tool_calls:
                    content.append({"type": "tool_use", "id": tc.id, "name": tc.name, "input": tc.arguments})
                sdk_msgs.append({"role": "assistant", "content": content})
            else:
                sdk_msgs.append({"role": msg.role, "content": msg.content or ""})

        sdk_tools = [
            {"name": t.name, "description": t.description, "input_schema": t.parameters}
            for t in tools
        ]
        kwargs: dict = {"model": model, "max_tokens": 4096, "system": system, "messages": sdk_msgs}
        if sdk_tools:
            kwargs["tools"] = sdk_tools

        resp = self._get_client().messages.create(**kwargs)

        text, tool_calls = "", []
        for block in resp.content:
            if block.type == "text":
                text = block.text
            elif block.type == "tool_use":
                tool_calls.append(ToolCall(id=block.id, name=block.name, arguments=block.input))

        return CompletionResult(
            message=Message(role="assistant", content=text or None, tool_calls=tool_calls),
            prompt_tokens=resp.usage.input_tokens,
            completion_tokens=resp.usage.output_tokens,
        )
```

- [ ] **Step 2: Create `api/ai/providers/openai.py`**

```python
import json
from openai import OpenAI
from api.ai.provider import AIProvider, Message, ToolCall, CompletionResult
from api.ai.config import get_api_key
from api.ai.tools import Tool


class OpenAIProvider(AIProvider):
    def __init__(self, base_url: str | None = None, api_key_provider: str = "openai"):
        self._client: OpenAI | None = None
        self._base_url = base_url
        self._api_key_provider = api_key_provider

    def _get_client(self) -> OpenAI:
        if not self._client:
            self._client = OpenAI(api_key=get_api_key(self._api_key_provider), base_url=self._base_url)
        return self._client

    def complete(self, messages: list[Message], system: str, tools: list[Tool], model: str) -> CompletionResult:
        oai_msgs: list[dict] = [{"role": "system", "content": system}]
        for msg in messages:
            if msg.role == "user" and not msg.tool_results:
                oai_msgs.append({"role": "user", "content": msg.content or ""})
            elif msg.role == "assistant" and msg.tool_calls:
                oai_msgs.append({
                    "role": "assistant",
                    "content": msg.content,
                    "tool_calls": [
                        {"id": tc.id, "type": "function",
                         "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)}}
                        for tc in msg.tool_calls
                    ],
                })
            elif msg.role == "user" and msg.tool_results:
                if msg.content:
                    oai_msgs.append({"role": "user", "content": msg.content})
                for tr in msg.tool_results:
                    oai_msgs.append({
                        "role": "tool",
                        "tool_call_id": tr.tool_call_id,
                        "content": json.dumps(tr.result) if not tr.is_error else f"Error: {tr.result}",
                    })
            else:
                oai_msgs.append({"role": msg.role, "content": msg.content or ""})

        oai_tools = [
            {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}}
            for t in tools
        ]
        kwargs: dict = {"model": model, "messages": oai_msgs}
        if oai_tools:
            kwargs["tools"] = oai_tools
            kwargs["tool_choice"] = "auto"

        resp = self._get_client().chat.completions.create(**kwargs)
        choice = resp.choices[0]

        tool_calls = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=json.loads(tc.function.arguments)))

        return CompletionResult(
            message=Message(role="assistant", content=choice.message.content, tool_calls=tool_calls),
            prompt_tokens=resp.usage.prompt_tokens,
            completion_tokens=resp.usage.completion_tokens,
        )
```

- [ ] **Step 3: Commit**

```bash
git add api/ai/providers/anthropic.py api/ai/providers/openai.py
git commit -m "feat(ai): Anthropic + OpenAI/OpenRouter provider implementations"
```

---

### Task 8: ChatSession

**Files:**
- Create: `api/ai/chat.py`

- [ ] **Step 1: Append to `tests/test_ai_module.py`**

```python
from unittest.mock import MagicMock, patch
from api.ai.chat import ChatSession, TurnResult
from api.ai.provider import Message, CompletionResult
import pytest

def test_chat_session_rejects_unknown_model():
    with pytest.raises(ValueError, match="not allowed"):
        ChatSession(provider="anthropic", model="gpt-unicorn", system_prompt="", tools=[])

def test_chat_session_single_turn_no_tools():
    from api.ai.tools import tool

    @tool(description="noop", parameters={"type": "object", "properties": {}, "required": []})
    def noop() -> dict:
        return {}

    mock_prov = MagicMock()
    mock_prov.complete.return_value = CompletionResult(
        message=Message(role="assistant", content="Done!", tool_calls=[]),
        prompt_tokens=10, completion_tokens=5,
    )
    session = ChatSession(provider="anthropic", model="claude-sonnet-4-6", system_prompt="sys", tools=[noop])
    with patch.object(session, "_provider", mock_prov):
        result = session.send("Hello")
    assert result.assistant_text == "Done!"
    assert result.tool_executions == []
```

- [ ] **Step 2: Run — expect fail**

Run: `python -m pytest tests/test_ai_module.py::test_chat_session_rejects_unknown_model -v`

- [ ] **Step 3: Create `api/ai/chat.py`**

```python
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any

from api.ai.config import is_model_allowed
from api.ai.cost import calculate_cost
from api.ai.provider import AIProvider, Message, ToolResult
from api.ai.tools import Tool


@dataclass
class ToolExecution:
    tool_name: str
    args: dict[str, Any]
    result: Any
    is_error: bool = False


@dataclass
class TurnResult:
    assistant_text: str | None
    tool_executions: list[ToolExecution]
    new_messages: list[Message]
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    provider: str
    model: str


class ChatSession:
    MAX_TOOL_ROUNDS = 10

    def __init__(self, provider: str, model: str, system_prompt: str,
                 tools: list[Tool], history: list[Message] | None = None):
        if not is_model_allowed(provider, model):
            raise ValueError(f"Model {model!r} not allowed for provider {provider!r}")
        self.provider_name = provider
        self.model = model
        self.system_prompt = system_prompt
        self.tools: dict[str, Tool] = {t.name: t for t in tools}
        self.history: list[Message] = list(history or [])
        self._provider: AIProvider = self._make_provider(provider)

    def _make_provider(self, provider: str) -> AIProvider:
        if provider == "anthropic":
            from api.ai.providers.anthropic import AnthropicProvider
            return AnthropicProvider()
        if provider == "openai":
            from api.ai.providers.openai import OpenAIProvider
            return OpenAIProvider(api_key_provider="openai")
        if provider == "openrouter":
            from api.ai.providers.openai import OpenAIProvider
            return OpenAIProvider(base_url="https://openrouter.ai/api/v1", api_key_provider="openrouter")
        raise ValueError(f"Unknown provider: {provider!r}")

    def send(self, user_message: str) -> TurnResult:
        user_msg = Message(role="user", content=user_message)
        self.history.append(user_msg)
        executions: list[ToolExecution] = []
        new_msgs: list[Message] = [user_msg]
        total_p = total_c = 0

        for _ in range(self.MAX_TOOL_ROUNDS):
            completion = self._provider.complete(
                messages=self.history, system=self.system_prompt,
                tools=list(self.tools.values()), model=self.model,
            )
            total_p += completion.prompt_tokens
            total_c += completion.completion_tokens
            asst = completion.message
            self.history.append(asst)
            new_msgs.append(asst)

            if not asst.tool_calls:
                break

            tool_results: list[ToolResult] = []
            for tc in asst.tool_calls:
                if tc.name not in self.tools:
                    res, err = {"error": f"Unknown tool: {tc.name}"}, True
                else:
                    try:
                        res, err = self.tools[tc.name].func(**tc.arguments), False
                    except Exception as exc:
                        res, err = {"error": str(exc)}, True
                executions.append(ToolExecution(tc.name, tc.arguments, res, err))
                tool_results.append(ToolResult(tc.id, tc.name, res, err))

            results_msg = Message(role="user", tool_results=tool_results)
            self.history.append(results_msg)
            new_msgs.append(results_msg)

        last_text = next(
            (m.content for m in reversed(new_msgs) if m.role == "assistant" and m.content), None
        )
        return TurnResult(
            assistant_text=last_text,
            tool_executions=executions,
            new_messages=new_msgs,
            prompt_tokens=total_p,
            completion_tokens=total_c,
            cost_usd=calculate_cost(self.provider_name, self.model, total_p, total_c),
            provider=self.provider_name,
            model=self.model,
        )
```

- [ ] **Step 4: Run — expect pass**

Run: `python -m pytest tests/test_ai_module.py -v`

- [ ] **Step 5: Update `api/ai/__init__.py`**

```python
from api.ai.chat import ChatSession, TurnResult
from api.ai.tools import tool, Tool

__all__ = ["ChatSession", "TurnResult", "tool", "Tool"]
```

- [ ] **Step 6: Commit**

```bash
git add api/ai/chat.py api/ai/__init__.py tests/test_ai_module.py
git commit -m "feat(ai): ChatSession with agentic tool-call loop, max 10 rounds"
```

---

### Task 9: DSL primitives (pydantic models)

**Files:**
- Create: `api/tools/pamphlets/render/__init__.py`
- Create: `api/tools/pamphlets/render/primitives.py`
- Create: `tests/test_pamphlet_primitives.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_pamphlet_primitives.py
import pytest
from api.tools.pamphlets.render.primitives import PageNode, SectionNode, ProductNode, TextNode, AnyNode
from pydantic import TypeAdapter

def test_page_node_defaults():
    p = PageNode(type="page", id="p1")
    assert p.width_mm == 297.0
    assert p.lang == "en"
    assert p.children == []

def test_section_grid():
    s = SectionNode(type="section", id="s1", layout="grid", cols=3)
    assert s.cols == 3

def test_product_node_requires_item_id():
    with pytest.raises(Exception):
        ProductNode(type="product", id="pr1")  # missing item_id

def test_discriminated_union_parses_text():
    adapter = TypeAdapter(AnyNode)
    node = adapter.validate_python({"type": "text", "id": "t1", "content": "Hello"})
    assert isinstance(node, TextNode)
    assert node.content == "Hello"

def test_style_overrides_rejects_bad_hex():
    from api.tools.pamphlets.render.primitives import StyleOverrides
    with pytest.raises(Exception):
        StyleOverrides(color_hex="notacolor").model_post_init(None)
```

- [ ] **Step 2: Run — expect fail**

Run: `python -m pytest tests/test_pamphlet_primitives.py -v`

- [ ] **Step 3: Create `api/tools/pamphlets/render/__init__.py`** (empty)

- [ ] **Step 4: Create `api/tools/pamphlets/render/primitives.py`**

```python
from __future__ import annotations
import re
from typing import Literal, Optional, Union, Annotated, Any
from pydantic import BaseModel, Field, model_validator


class StyleOverrides(BaseModel):
    font_size_token: Optional[Literal["xs","sm","md","lg","xl","2xl"]] = None
    font_size_px: Optional[int] = Field(None, ge=8, le=72)
    font_weight: Optional[Literal["regular","medium","bold"]] = None
    color_token: Optional[Literal["primary","secondary","accent","bg","surface","text","text_muted","border","success","danger"]] = None
    color_hex: Optional[str] = None
    text_align: Optional[Literal["left","center","right"]] = None
    padding_token: Optional[Literal["xs","sm","md","lg"]] = None
    margin_token: Optional[Literal["xs","sm","md","lg"]] = None

    @model_validator(mode="after")
    def validate_hex(self):
        if self.color_hex and not re.match(r"^#[0-9a-fA-F]{6}$", self.color_hex):
            raise ValueError(f"color_hex must be #rrggbb, got: {self.color_hex}")
        return self


class PageNode(BaseModel):
    type: Literal["page"]
    id: str
    width_mm: float = 297.0
    height_mm: float = 210.0
    padding: Literal["xs","sm","md","lg"] = "md"
    theme_id: str = "minimal_light"
    lang: Literal["en","hi","kn"] = "en"
    children: list[AnyNode] = Field(default_factory=list)


class SectionNode(BaseModel):
    type: Literal["section"]
    id: str
    layout: Literal["grid","flex","stack"]
    cols: Optional[int] = None
    rows: Optional[int] = None
    gap: Literal["xs","sm","md","lg"] = "md"
    align: Literal["start","center","end","stretch"] = "start"
    children: list[AnyNode] = Field(default_factory=list)
    style_overrides: Optional[StyleOverrides] = None


class SlotNode(BaseModel):
    type: Literal["slot"]
    id: str
    span_cols: Optional[int] = None
    span_rows: Optional[int] = None
    align: Literal["start","center","end","stretch"] = "start"
    children: list[AnyNode] = Field(default_factory=list)
    style_overrides: Optional[StyleOverrides] = None


class ProductNode(BaseModel):
    type: Literal["product"]
    id: str
    item_id: str
    layout: Literal["card","list","banner"] = "card"
    show_image: bool = True
    show_mrp: bool = True
    show_offer: bool = True
    show_badge: bool = True
    image_position: Literal["top","left","bg"] = "top"
    lang: Literal["en","hi","kn"] = "en"
    style_overrides: Optional[StyleOverrides] = None


class TextNode(BaseModel):
    type: Literal["text"]
    id: str
    content: str
    variant: Literal["heading","subheading","body","price","caption"] = "body"
    align: Literal["left","center","right"] = "left"
    lang: Literal["en","hi","kn"] = "en"
    style_overrides: Optional[StyleOverrides] = None


class ImageNode(BaseModel):
    type: Literal["image"]
    id: str
    src: str
    alt: str = ""
    fit: Literal["cover","contain"] = "contain"
    radius: Literal["sm","md","lg","none"] = "none"
    style_overrides: Optional[StyleOverrides] = None


class DividerNode(BaseModel):
    type: Literal["divider"]
    id: str
    orientation: Literal["horizontal","vertical"] = "horizontal"
    thickness: int = 1
    color_token: Literal["primary","accent","border","text_muted"] = "border"
    style: Literal["solid","dashed","dotted"] = "solid"


class SpacerNode(BaseModel):
    type: Literal["spacer"]
    id: str
    size: Literal["xs","sm","md","lg","xl"]


class OfferBannerNode(BaseModel):
    type: Literal["offer_banner"]
    id: str
    headline: str
    subtext: Optional[str] = None
    accent_color_token: Optional[Literal["primary","accent","secondary","success","danger"]] = None
    shape: Literal["ribbon","badge","strip"] = "strip"
    style_overrides: Optional[StyleOverrides] = None


class LogoNode(BaseModel):
    type: Literal["logo"]
    id: str
    src: str
    height_px: int = 60
    position: Literal["left","center","right"] = "left"


class DecorationNode(BaseModel):
    type: Literal["decoration"]
    id: str
    kind: Literal["wave","dots","corners","border_frame"]
    color_token: Literal["primary","accent","secondary","text_muted"] = "accent"


class QrCodeNode(BaseModel):
    type: Literal["qr_code"]
    id: str
    url: str
    size_px: int = 96
    label: Optional[str] = None


class ContactStripNode(BaseModel):
    type: Literal["contact_strip"]
    id: str
    phone: Optional[str] = None
    address: Optional[str] = None
    map_url: Optional[str] = None
    wa_link: Optional[str] = None
    style_overrides: Optional[StyleOverrides] = None


class PriceCompareItem(BaseModel):
    label: str
    mrp: float
    offer: float
    badge: Optional[str] = None


class PriceCompareNode(BaseModel):
    type: Literal["price_compare"]
    id: str
    items: list[PriceCompareItem]
    layout: Literal["horizontal","vertical","podium"] = "horizontal"
    highlight_index: Optional[int] = None
    show_savings: bool = True


class CustomHtmlNode(BaseModel):
    type: Literal["custom_html"]
    id: str
    html: str
    scoped_css: Optional[str] = None


class RawSvgNode(BaseModel):
    type: Literal["raw_svg"]
    id: str
    svg: str


AnyNode = Annotated[
    Union[
        PageNode, SectionNode, SlotNode, ProductNode, TextNode,
        ImageNode, DividerNode, SpacerNode, OfferBannerNode, LogoNode,
        DecorationNode, QrCodeNode, ContactStripNode, PriceCompareNode,
        CustomHtmlNode, RawSvgNode,
    ],
    Field(discriminator="type"),
]

PageNode.model_rebuild()
SectionNode.model_rebuild()
SlotNode.model_rebuild()
```

- [ ] **Step 5: Run — expect pass**

Run: `python -m pytest tests/test_pamphlet_primitives.py -v`

- [ ] **Step 6: Commit**

```bash
git add api/tools/pamphlets/render/__init__.py api/tools/pamphlets/render/primitives.py tests/test_pamphlet_primitives.py
git commit -m "feat(pamphlets): DSL pydantic primitives — 16 node types with discriminated union"
```

---

### Task 10: Theme JSON files + loader

**Files:**
- Create: `api/tools/pamphlets/themes/minimal_light.json`
- Create: `api/tools/pamphlets/themes/minimal_dark.json`
- Create: `api/tools/pamphlets/themes/monsoon.json`
- Create: `api/tools/pamphlets/themes/diwali.json`
- Create: `api/tools/pamphlets/themes/summer.json`
- Create: `api/tools/pamphlets/themes/__init__.py`

- [ ] **Step 1: Create `api/tools/pamphlets/themes/minimal_light.json`**

```json
{
  "id": "minimal_light",
  "name": "Minimal Light",
  "tokens": {
    "colors": {
      "primary": "#1a1a2e", "secondary": "#16213e", "accent": "#e94560",
      "bg": "#ffffff", "surface": "#f5f5f5", "text": "#1a1a2e",
      "text_muted": "#6b7280", "border": "#e5e7eb", "success": "#10b981", "danger": "#ef4444"
    },
    "typography": {
      "font_body": "Geist, Inter, sans-serif",
      "font_heading": "Geist, Inter, sans-serif",
      "font_price": "Geist, Inter, sans-serif"
    },
    "spacing": {"xs": "4px","sm": "8px","md": "16px","lg": "24px","xl": "40px"},
    "radii": {"sm": "4px","md": "8px","lg": "16px"},
    "shadows": {"sm": "0 1px 3px rgba(0,0,0,0.1)","md": "0 4px 12px rgba(0,0,0,0.1)","lg": "0 8px 24px rgba(0,0,0,0.15)"},
    "decoration": {}
  }
}
```

- [ ] **Step 2: Create `api/tools/pamphlets/themes/minimal_dark.json`**

```json
{
  "id": "minimal_dark",
  "name": "Minimal Dark",
  "tokens": {
    "colors": {
      "primary": "#e2e8f0", "secondary": "#94a3b8", "accent": "#f59e0b",
      "bg": "#0f172a", "surface": "#1e293b", "text": "#e2e8f0",
      "text_muted": "#94a3b8", "border": "#334155", "success": "#34d399", "danger": "#f87171"
    },
    "typography": {
      "font_body": "Geist, Inter, sans-serif",
      "font_heading": "Geist, Inter, sans-serif",
      "font_price": "Geist, Inter, sans-serif"
    },
    "spacing": {"xs": "4px","sm": "8px","md": "16px","lg": "24px","xl": "40px"},
    "radii": {"sm": "4px","md": "8px","lg": "16px"},
    "shadows": {"sm": "0 1px 3px rgba(0,0,0,0.4)","md": "0 4px 12px rgba(0,0,0,0.4)","lg": "0 8px 24px rgba(0,0,0,0.5)"},
    "decoration": {}
  }
}
```

- [ ] **Step 3: Create `api/tools/pamphlets/themes/monsoon.json`**

```json
{
  "id": "monsoon",
  "name": "Monsoon",
  "tokens": {
    "colors": {
      "primary": "#1e3a5f", "secondary": "#2d6a9f", "accent": "#00b4d8",
      "bg": "#f0f8ff", "surface": "#e0f0ff", "text": "#0d2137",
      "text_muted": "#4a7fa5", "border": "#b3d9f2", "success": "#06b6d4", "danger": "#dc2626"
    },
    "typography": {
      "font_body": "Geist, Inter, sans-serif",
      "font_heading": "Geist, Inter, sans-serif",
      "font_price": "Geist, Inter, sans-serif"
    },
    "spacing": {"xs": "4px","sm": "8px","md": "16px","lg": "24px","xl": "40px"},
    "radii": {"sm": "6px","md": "12px","lg": "20px"},
    "shadows": {"sm": "0 2px 8px rgba(0,100,180,0.15)","md": "0 6px 20px rgba(0,100,180,0.2)","lg": "0 12px 40px rgba(0,100,180,0.25)"},
    "decoration": {
      "bg_gradient": "linear-gradient(135deg, #f0f8ff 0%, #e0f0ff 50%, #cce8ff 100%)"
    }
  }
}
```

- [ ] **Step 4: Create `api/tools/pamphlets/themes/diwali.json`**

```json
{
  "id": "diwali",
  "name": "Diwali",
  "tokens": {
    "colors": {
      "primary": "#7c2d12", "secondary": "#c2410c", "accent": "#f59e0b",
      "bg": "#fef3c7", "surface": "#fde68a", "text": "#451a03",
      "text_muted": "#92400e", "border": "#fbbf24", "success": "#d97706", "danger": "#dc2626"
    },
    "typography": {
      "font_body": "Geist, Inter, sans-serif",
      "font_heading": "Geist, Inter, sans-serif",
      "font_price": "Geist, Inter, sans-serif"
    },
    "spacing": {"xs": "4px","sm": "8px","md": "16px","lg": "24px","xl": "40px"},
    "radii": {"sm": "4px","md": "8px","lg": "16px"},
    "shadows": {"sm": "0 2px 8px rgba(180,80,0,0.2)","md": "0 6px 20px rgba(180,80,0,0.25)","lg": "0 12px 40px rgba(180,80,0,0.3)"},
    "decoration": {
      "bg_gradient": "linear-gradient(135deg, #fef3c7 0%, #fde68a 60%, #fcd34d 100%)"
    }
  }
}
```

- [ ] **Step 5: Create `api/tools/pamphlets/themes/summer.json`**

```json
{
  "id": "summer",
  "name": "Summer",
  "tokens": {
    "colors": {
      "primary": "#065f46", "secondary": "#059669", "accent": "#f97316",
      "bg": "#ecfdf5", "surface": "#d1fae5", "text": "#022c22",
      "text_muted": "#047857", "border": "#6ee7b7", "success": "#10b981", "danger": "#dc2626"
    },
    "typography": {
      "font_body": "Geist, Inter, sans-serif",
      "font_heading": "Geist, Inter, sans-serif",
      "font_price": "Geist, Inter, sans-serif"
    },
    "spacing": {"xs": "4px","sm": "8px","md": "16px","lg": "24px","xl": "40px"},
    "radii": {"sm": "8px","md": "16px","lg": "24px"},
    "shadows": {"sm": "0 2px 8px rgba(0,120,60,0.1)","md": "0 6px 20px rgba(0,120,60,0.15)","lg": "0 12px 40px rgba(0,120,60,0.2)"},
    "decoration": {
      "bg_gradient": "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)"
    }
  }
}
```

- [ ] **Step 6: Create `api/tools/pamphlets/themes/__init__.py`**

```python
import json
from pathlib import Path

_THEMES_DIR = Path(__file__).parent
_CACHE: dict[str, dict] = {}

PRESET_IDS = ["minimal_light", "minimal_dark", "monsoon", "diwali", "summer"]


def load_theme(theme_id: str) -> dict:
    """Load theme dict by preset ID. Raises KeyError if not found."""
    if theme_id not in _CACHE:
        path = _THEMES_DIR / f"{theme_id}.json"
        if not path.exists():
            raise KeyError(f"Unknown theme: {theme_id!r}")
        _CACHE[theme_id] = json.loads(path.read_text())
    return _CACHE[theme_id]


def list_themes() -> list[dict]:
    return [load_theme(tid) for tid in PRESET_IDS]


def apply_overrides(theme: dict, overrides: dict) -> dict:
    """Merge token overrides into a loaded theme dict. Returns new dict."""
    import copy
    merged = copy.deepcopy(theme)
    tokens = merged.setdefault("tokens", {})
    for section, values in overrides.items():
        tokens.setdefault(section, {}).update(values)
    return merged
```

- [ ] **Step 7: Verify loader works**

Run: `python -c "from api.tools.pamphlets.themes import load_theme; t = load_theme('monsoon'); print(t['tokens']['colors']['accent'])"`
Expected: `#00b4d8`

- [ ] **Step 8: Commit**

```bash
git add api/tools/pamphlets/themes/
git commit -m "feat(pamphlets): 5 theme presets (minimal_light/dark, monsoon, diwali, summer) + theme loader"
```

---

### Task 11: HTML renderer

**Files:**
- Create: `api/tools/pamphlets/render/html.py`
- Create: `tests/test_pamphlet_render_html.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_pamphlet_render_html.py
from api.tools.pamphlets.render.html import render_pamphlet

SIMPLE_DSL = {
    "type": "page", "id": "p1", "theme_id": "minimal_light",
    "children": [{
        "type": "section", "id": "s1", "layout": "grid", "cols": 2,
        "children": [
            {"type": "text", "id": "t1", "content": "Sale!", "variant": "heading"},
            {"type": "product", "id": "pr1", "item_id": "item-abc"},
        ]
    }]
}
ITEMS = {"item-abc": {"display_name": "Rice 1kg", "offer_price": 55.0, "original_price": 70.0, "highlight_text": "Save ₹15", "image_url": None}}

def test_render_returns_html_string():
    html = render_pamphlet(SIMPLE_DSL, {}, ITEMS)
    assert "<!DOCTYPE html>" in html
    assert "Sale!" in html
    assert "Rice 1kg" in html

def test_render_includes_css_vars_from_theme():
    from api.tools.pamphlets.themes import load_theme
    theme = load_theme("monsoon")
    html = render_pamphlet(SIMPLE_DSL, theme, ITEMS)
    assert "--primary" in html
    assert "--accent" in html

def test_render_page_dimensions():
    html = render_pamphlet(SIMPLE_DSL, {}, ITEMS)
    assert "297mm" in html
    assert "210mm" in html
```

- [ ] **Step 2: Run — expect fail**

Run: `python -m pytest tests/test_pamphlet_render_html.py -v`

- [ ] **Step 3: Create `api/tools/pamphlets/render/html.py`**

```python
from __future__ import annotations
from api.tools.pamphlets.render.primitives import (
    PageNode, SectionNode, SlotNode, ProductNode, TextNode, ImageNode,
    DividerNode, SpacerNode, OfferBannerNode, LogoNode, DecorationNode,
    QrCodeNode, ContactStripNode, PriceCompareNode, CustomHtmlNode, RawSvgNode,
)
from api.tools.pamphlets.themes import load_theme, apply_overrides

_SPACING = {"xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "40px"}
_FONT_URLS = {
    "hi": "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&display=swap",
    "kn": "https://fonts.googleapis.com/css2?family=Noto+Sans+Kannada:wght@400;700&display=swap",
}
_VARIANT_STYLES = {
    "heading":    "font-size:2rem;font-weight:700;color:var(--primary);",
    "subheading": "font-size:1.25rem;font-weight:600;color:var(--secondary);",
    "body":       "font-size:0.875rem;color:var(--text);",
    "price":      "font-size:1.5rem;font-weight:700;color:var(--accent);",
    "caption":    "font-size:0.75rem;color:var(--text-muted);",
}


def render_pamphlet(dsl: dict, theme: dict, items_lookup: dict[str, dict]) -> str:
    page = PageNode.model_validate(dsl)

    # Resolve theme: if theme dict has preset id, load it; then apply overrides
    resolved_theme = _resolve_theme(theme if theme else {}, page.theme_id)
    css_vars = _theme_to_css_vars(resolved_theme)
    font_links = _collect_font_links(page)

    body = _render_children(page.children, items_lookup)
    pad = _SPACING.get(page.padding, "16px")
    bg_gradient = resolved_theme.get("tokens", {}).get("decoration", {}).get("bg_gradient", "")
    bg_style = f"background: {bg_gradient};" if bg_gradient else "background: var(--bg);"

    return f"""<!DOCTYPE html>
<html lang="{page.lang}">
<head>
<meta charset="utf-8">
{font_links}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&display=swap" rel="stylesheet">
<style>
@page {{ size: {page.width_mm}mm {page.height_mm}mm; margin: 0; }}
:root {{{css_vars}}}
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}
body{{width:{page.width_mm}mm;min-height:{page.height_mm}mm;{bg_style}font-family:var(--font-body,Geist,sans-serif);color:var(--text);overflow:hidden;}}
.page-root{{width:100%;min-height:{page.height_mm}mm;padding:{pad};}}
.section-grid{{display:grid;}}
.section-flex{{display:flex;flex-wrap:wrap;}}
.section-stack{{display:flex;flex-direction:column;}}
.product-card{{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md,8px);padding:8px;display:flex;flex-direction:column;gap:4px;}}
.product-badge{{background:var(--accent);color:#fff;font-size:0.65rem;padding:2px 6px;border-radius:99px;align-self:flex-start;}}
.price-offer{{color:var(--accent);font-weight:700;}}
.price-mrp{{color:var(--text-muted);font-size:0.75rem;text-decoration:line-through;}}
.offer-banner-strip{{background:var(--accent);color:#fff;padding:12px 24px;text-align:center;border-radius:var(--radius-md,8px);}}
.offer-banner-ribbon{{background:var(--accent);color:#fff;padding:8px 32px;clip-path:polygon(0 0,100% 0,calc(100% - 16px) 50%,100% 100%,0 100%,16px 50%);text-align:center;}}
.offer-banner-badge{{background:var(--accent);color:#fff;border-radius:50%;width:120px;height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:auto;}}
.contact-strip{{display:flex;gap:16px;align-items:center;font-size:0.75rem;color:var(--text-muted);padding:8px;border-top:1px solid var(--border);}}
</style>
</head>
<body>
<div class="page-root">{body}</div>
</body>
</html>"""


def _resolve_theme(theme: dict, fallback_id: str) -> dict:
    from api.tools.pamphlets.themes import load_theme, apply_overrides
    preset_id = theme.get("preset") or theme.get("id") or fallback_id
    try:
        base = load_theme(preset_id)
    except KeyError:
        base = load_theme("minimal_light")
    overrides = theme.get("overrides", {})
    return apply_overrides(base, overrides) if overrides else base


def _theme_to_css_vars(theme: dict) -> str:
    tokens = theme.get("tokens", {})
    lines = []
    for k, v in tokens.get("colors", {}).items():
        lines.append(f"--{k.replace('_','-')}:{v};")
    for k, v in tokens.get("typography", {}).items():
        lines.append(f"--font-{k.replace('_','-')}:{v};")
    for k, v in tokens.get("radii", {}).items():
        lines.append(f"--radius-{k}:{v};")
    return "".join(lines)


def _collect_font_links(page: PageNode) -> str:
    langs = _collect_langs(page)
    return "\n".join(f'<link rel="stylesheet" href="{_FONT_URLS[l]}">' for l in langs if l in _FONT_URLS)


def _collect_langs(node) -> set[str]:
    langs: set[str] = set()
    if hasattr(node, "lang"):
        langs.add(node.lang)
    if hasattr(node, "children"):
        for c in node.children:
            langs |= _collect_langs(c)
    return langs


def _render_children(children: list, lookup: dict) -> str:
    return "".join(_render_node(c, lookup) for c in children)


def _style_overrides(so) -> str:
    if not so:
        return ""
    parts = []
    if so.font_size_px:
        parts.append(f"font-size:{so.font_size_px}px;")
    if so.font_size_token:
        sz = {"xs":"10px","sm":"12px","md":"14px","lg":"18px","xl":"22px","2xl":"28px"}.get(so.font_size_token,"")
        parts.append(f"font-size:{sz};")
    if so.font_weight:
        parts.append(f"font-weight:{'400' if so.font_weight=='regular' else '500' if so.font_weight=='medium' else '700'};")
    if so.color_hex:
        parts.append(f"color:{so.color_hex};")
    elif so.color_token:
        parts.append(f"color:var(--{so.color_token.replace('_','-')});")
    if so.text_align:
        parts.append(f"text-align:{so.text_align};")
    if so.padding_token:
        parts.append(f"padding:{_SPACING.get(so.padding_token,'8px')};")
    if so.margin_token:
        parts.append(f"margin:{_SPACING.get(so.margin_token,'8px')};")
    return "".join(parts)


def _render_node(node, lookup: dict) -> str:
    t = getattr(node, "type", "")
    if t == "section":   return _render_section(node, lookup)
    if t == "slot":      return _render_slot(node, lookup)
    if t == "product":   return _render_product(node, lookup)
    if t == "text":      return _render_text(node)
    if t == "image":     return _render_image(node)
    if t == "divider":   return _render_divider(node)
    if t == "spacer":    return _render_spacer(node)
    if t == "offer_banner": return _render_offer_banner(node)
    if t == "logo":      return _render_logo(node)
    if t == "decoration": return _render_decoration(node)
    if t == "qr_code":   return _render_qr_code(node)
    if t == "contact_strip": return _render_contact_strip(node)
    if t == "price_compare": return _render_price_compare(node)
    if t == "custom_html": return f'<div style="all:initial">{node.html}</div>'
    if t == "raw_svg":   return node.svg
    return ""


def _render_section(n: SectionNode, lookup: dict) -> str:
    cls = f"section-{n.layout}"
    extra = ""
    if n.layout == "grid" and n.cols:
        extra += f"grid-template-columns:repeat({n.cols},1fr);"
    gap = _SPACING.get(n.gap, "16px")
    extra += f"gap:{gap};"
    so = _style_overrides(n.style_overrides)
    return f'<div class="{cls}" style="{extra}{so}">{_render_children(n.children, lookup)}</div>'


def _render_slot(n: SlotNode, lookup: dict) -> str:
    style = ""
    if n.span_cols:
        style += f"grid-column:span {n.span_cols};"
    if n.span_rows:
        style += f"grid-row:span {n.span_rows};"
    style += _style_overrides(n.style_overrides)
    return f'<div style="display:flex;align-items:{n.align};{style}">{_render_children(n.children, lookup)}</div>'


def _render_product(n: ProductNode, lookup: dict) -> str:
    item = lookup.get(n.item_id, {})
    name = item.get("display_name", "Product")
    offer = item.get("offer_price")
    mrp = item.get("original_price")
    badge = item.get("highlight_text", "")
    img_url = item.get("image_url", "")
    so = _style_overrides(n.style_overrides)

    img_html = f'<img src="{img_url}" style="width:100%;height:80px;object-fit:contain;" alt="{name}">' if (n.show_image and img_url) else ""
    badge_html = f'<span class="product-badge">{badge}</span>' if (n.show_badge and badge) else ""
    mrp_html = f'<span class="price-mrp">₹{mrp}</span>' if (n.show_mrp and mrp) else ""
    offer_html = f'<span class="price-offer">₹{offer}</span>' if (n.show_offer and offer) else ""
    return f'<div class="product-card" style="{so}">{img_html}{badge_html}<span style="font-size:0.8rem;font-weight:600;">{name}</span><div style="display:flex;gap:6px;align-items:baseline;">{offer_html}{mrp_html}</div></div>'


def _render_text(n: TextNode) -> str:
    vs = _VARIANT_STYLES.get(n.variant, "")
    so = _style_overrides(n.style_overrides)
    return f'<p style="text-align:{n.align};{vs}{so}">{n.content}</p>'


def _render_image(n: ImageNode) -> str:
    r = {"sm":"4px","md":"8px","lg":"16px","none":"0"}.get(n.radius,"0")
    return f'<img src="{n.src}" alt="{n.alt}" style="object-fit:{n.fit};border-radius:{r};max-width:100%;">'


def _render_divider(n: DividerNode) -> str:
    if n.orientation == "horizontal":
        return f'<hr style="border:none;border-top:{n.thickness}px {n.style} var(--{n.color_token.replace("_","-")});margin:4px 0;">'
    return f'<div style="width:{n.thickness}px;border-left:{n.thickness}px {n.style} var(--{n.color_token.replace("_","-")});align-self:stretch;"></div>'


def _render_spacer(n: SpacerNode) -> str:
    h = _SPACING.get(n.size, "16px")
    return f'<div style="height:{h};flex-shrink:0;"></div>'


def _render_offer_banner(n: OfferBannerNode) -> str:
    cls = f"offer-banner-{n.shape}"
    accent = f"background:var(--{n.accent_color_token.replace('_','-')});" if n.accent_color_token else ""
    sub = f'<p style="font-size:0.75rem;opacity:0.9;">{n.subtext}</p>' if n.subtext else ""
    so = _style_overrides(n.style_overrides)
    return f'<div class="{cls}" style="{accent}{so}"><strong style="font-size:1.1rem;">{n.headline}</strong>{sub}</div>'


def _render_logo(n: LogoNode) -> str:
    align = {"left":"flex-start","center":"center","right":"flex-end"}.get(n.position,"flex-start")
    return f'<div style="display:flex;justify-content:{align};"><img src="{n.src}" style="height:{n.height_px}px;object-fit:contain;" alt="logo"></div>'


def _render_decoration(n: DecorationNode) -> str:
    color = f"var(--{n.color_token.replace('_','-')})"
    if n.kind == "wave":
        return f'<div style="overflow:hidden;height:40px;"><svg viewBox="0 0 1200 40" preserveAspectRatio="none" style="width:100%;height:100%;"><path d="M0,20 C300,40 600,0 900,20 C1050,30 1150,10 1200,20 L1200,40 L0,40 Z" fill="{color}"/></svg></div>'
    if n.kind == "dots":
        return f'<div style="text-align:center;letter-spacing:8px;color:{color};font-size:1.2rem;">• • • • • • • • • •</div>'
    if n.kind == "corners":
        return f'<div style="position:relative;pointer-events:none;"><div style="position:absolute;top:0;left:0;width:24px;height:24px;border-top:3px solid {color};border-left:3px solid {color};"></div><div style="position:absolute;top:0;right:0;width:24px;height:24px;border-top:3px solid {color};border-right:3px solid {color};"></div></div>'
    if n.kind == "border_frame":
        return f'<div style="position:absolute;inset:8px;border:2px solid {color};border-radius:8px;pointer-events:none;"></div>'
    return ""


def _render_qr_code(n: QrCodeNode) -> str:
    label = f'<p style="font-size:0.6rem;text-align:center;color:var(--text-muted);">{n.label}</p>' if n.label else ""
    return f'<div style="display:inline-flex;flex-direction:column;align-items:center;gap:4px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size={n.size_px}x{n.size_px}&data={n.url}" width="{n.size_px}" height="{n.size_px}" alt="QR">{label}</div>'


def _render_contact_strip(n: ContactStripNode) -> str:
    parts = []
    if n.phone:   parts.append(f'<span>📞 {n.phone}</span>')
    if n.address: parts.append(f'<span>📍 {n.address}</span>')
    if n.wa_link: parts.append(f'<a href="{n.wa_link}" style="color:var(--success);">WhatsApp</a>')
    so = _style_overrides(n.style_overrides)
    return f'<div class="contact-strip" style="{so}">{"".join(parts)}</div>'


def _render_price_compare(n: PriceCompareNode) -> str:
    cards = []
    for i, item in enumerate(n.items):
        highlight = "border:2px solid var(--accent);" if i == n.highlight_index else "border:1px solid var(--border);"
        savings = f"<span style='font-size:0.65rem;color:var(--success);'>Save ₹{item.mrp - item.offer:.0f}</span>" if n.show_savings else ""
        badge = f"<span style='background:var(--accent);color:#fff;font-size:0.6rem;padding:1px 4px;border-radius:4px;'>{item.badge}</span>" if item.badge else ""
        cards.append(f'<div style="padding:8px;border-radius:8px;text-align:center;{highlight}"><p style="font-size:0.75rem;font-weight:600;">{item.label}</p>{badge}<p style="color:var(--accent);font-weight:700;">₹{item.offer}</p><p style="text-decoration:line-through;color:var(--text-muted);font-size:0.7rem;">₹{item.mrp}</p>{savings}</div>')
    flex = "flex-direction:column;" if n.layout == "vertical" else ""
    return f'<div style="display:flex;{flex}gap:8px;justify-content:center;">{"".join(cards)}</div>'
```

- [ ] **Step 4: Run — expect pass**

Run: `python -m pytest tests/test_pamphlet_render_html.py -v`

- [ ] **Step 5: Commit**

```bash
git add api/tools/pamphlets/render/html.py tests/test_pamphlet_render_html.py
git commit -m "feat(pamphlets): DSL → HTML renderer, all 16 primitive types, theme CSS vars, multi-lang fonts"
```

---

### Task 12: Playwright PDF renderer + app lifecycle

**Files:**
- Create: `api/tools/pamphlets/render/pdf.py`
- Modify: `api/main.py`

- [ ] **Step 1: Create `api/tools/pamphlets/render/pdf.py`**

```python
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
```

- [ ] **Step 2: Add Playwright lifecycle to `api/main.py`**

Find the FastAPI `app = FastAPI(...)` instantiation in `api/main.py` and add startup/shutdown events. Read the file first to find the exact location, then add:

```python
# At top of api/main.py, add import:
from contextlib import asynccontextmanager

# Replace bare app = FastAPI(...) with lifespan pattern:
@asynccontextmanager
async def lifespan(app: FastAPI):
    from api.tools.pamphlets.render.pdf import launch_browser, close_browser
    pw, browser = await launch_browser()
    app.state.playwright = pw
    app.state.browser = browser
    yield
    await close_browser(pw, browser)

app = FastAPI(lifespan=lifespan, ...)
```

- [ ] **Step 3: Verify browser launches on startup**

Run: `python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000`
Expected: server starts without error, no Playwright errors in console.

- [ ] **Step 4: Commit**

```bash
git add api/tools/pamphlets/render/pdf.py api/main.py
git commit -m "feat(pamphlets): Playwright PDF renderer + browser lifecycle in app startup/shutdown"
```

---

### Task 13: Pamphlet AI tools

**Files:**
- Create: `api/tools/pamphlets/ai_tools.py`
- Create: `tests/test_pamphlet_ai_tools.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_pamphlet_ai_tools.py
import uuid
from api.tools.pamphlets.ai_tools import build_tools, PamphletState

def _make_state():
    return PamphletState(
        dsl={
            "type": "page", "id": "p1", "theme_id": "minimal_light",
            "children": [{"type": "section", "id": "s1", "layout": "grid", "cols": 2, "children": []}]
        },
        theme={"preset": "minimal_light"},
        items={},
    )

def test_set_theme_changes_theme():
    state = _make_state()
    tools = {t.name: t for t in build_tools(state)}
    tools["set_theme"].func(name="monsoon")
    assert state.theme["preset"] == "monsoon"

def test_insert_node_adds_child():
    state = _make_state()
    tools = {t.name: t for t in build_tools(state)}
    tools["insert_node"].func(
        parent_id="s1",
        position=0,
        node={"type": "text", "id": "new-t", "content": "Hello"}
    )
    section = state.dsl["children"][0]
    assert section["children"][0]["id"] == "new-t"

def test_remove_node():
    state = _make_state()
    state.dsl["children"][0]["children"] = [{"type": "text", "id": "rem1", "content": "bye"}]
    tools = {t.name: t for t in build_tools(state)}
    tools["remove_node"].func(node_id="rem1")
    assert state.dsl["children"][0]["children"] == []
```

- [ ] **Step 2: Run — expect fail**

Run: `python -m pytest tests/test_pamphlet_ai_tools.py -v`

- [ ] **Step 3: Create `api/tools/pamphlets/ai_tools.py`**

```python
from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from typing import Any

from api.ai.tools import tool, Tool
from api.tools.pamphlets.themes import load_theme, apply_overrides, PRESET_IDS


@dataclass
class PamphletState:
    """Mutable DSL state shared across all tool calls in one chat turn."""
    dsl: dict
    theme: dict
    items: dict[str, dict]  # item_id → {display_name, offer_price, ...}
    dirty: bool = False


def _find_node(tree: dict, node_id: str) -> tuple[dict | None, list | None, int]:
    """Return (node, parent_children_list, index) or (None, None, -1)."""
    children = tree.get("children", [])
    for i, child in enumerate(children):
        if child.get("id") == node_id:
            return child, children, i
        found, lst, idx = _find_node(child, node_id)
        if found is not None:
            return found, lst, idx
    return None, None, -1


def build_tools(state: PamphletState) -> list[Tool]:

    @tool(
        description="Apply a named theme preset to the pamphlet.",
        parameters={"type": "object", "properties": {
            "name": {"type": "string", "enum": PRESET_IDS}
        }, "required": ["name"]}
    )
    def set_theme(name: str) -> dict:
        state.theme = {"preset": name}
        state.dsl["theme_id"] = name
        state.dirty = True
        return {"ok": True, "theme": name}

    @tool(
        description="Override individual theme token values (colors, typography, spacing).",
        parameters={"type": "object", "properties": {
            "section": {"type": "string", "enum": ["colors", "typography", "spacing", "radii", "decoration"]},
            "tokens": {"type": "object"}
        }, "required": ["section", "tokens"]}
    )
    def update_theme_tokens(section: str, tokens: dict) -> dict:
        state.theme.setdefault("overrides", {}).setdefault(section, {}).update(tokens)
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Generate a new theme from a text description (e.g. 'rainy dark blue moody').",
        parameters={"type": "object", "properties": {
            "description": {"type": "string"}
        }, "required": ["description"]}
    )
    def generate_theme(description: str) -> dict:
        # This tool triggers a nested LLM call via the session; for now return a stub
        # Real impl in ai_session.py calls Claude to produce tokens then calls update_theme_tokens
        return {"ok": True, "message": f"Generating theme for: {description}"}

    @tool(
        description="Insert a new node as a child of parent_id at given position (0 = first).",
        parameters={"type": "object", "properties": {
            "parent_id": {"type": "string"},
            "position": {"type": "integer"},
            "node": {"type": "object"}
        }, "required": ["parent_id", "position", "node"]}
    )
    def insert_node(parent_id: str, position: int, node: dict) -> dict:
        if "id" not in node:
            node["id"] = str(uuid.uuid4())[:8]
        parent, _, _ = _find_node(state.dsl, parent_id)
        if parent is None and state.dsl.get("id") == parent_id:
            parent = state.dsl
        if parent is None:
            return {"error": f"Parent node {parent_id!r} not found"}
        children = parent.setdefault("children", [])
        position = max(0, min(position, len(children)))
        children.insert(position, node)
        state.dirty = True
        return {"ok": True, "inserted_id": node["id"]}

    @tool(
        description="Update fields on an existing node by id.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"},
            "patch": {"type": "object"}
        }, "required": ["node_id", "patch"]}
    )
    def update_node(node_id: str, patch: dict) -> dict:
        node, _, _ = _find_node(state.dsl, node_id)
        if node is None and state.dsl.get("id") == node_id:
            node = state.dsl
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        node.update(patch)
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Remove a node by id.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"}
        }, "required": ["node_id"]}
    )
    def remove_node(node_id: str) -> dict:
        _, parent_children, idx = _find_node(state.dsl, node_id)
        if parent_children is None:
            return {"error": f"Node {node_id!r} not found"}
        parent_children.pop(idx)
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Move a node to a new parent at a given position.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"},
            "new_parent_id": {"type": "string"},
            "new_position": {"type": "integer"}
        }, "required": ["node_id", "new_parent_id", "new_position"]}
    )
    def move_node(node_id: str, new_parent_id: str, new_position: int) -> dict:
        node, parent_children, idx = _find_node(state.dsl, node_id)
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        parent_children.pop(idx)
        new_parent, _, _ = _find_node(state.dsl, new_parent_id)
        if new_parent is None:
            return {"error": f"New parent {new_parent_id!r} not found"}
        children = new_parent.setdefault("children", [])
        children.insert(max(0, min(new_position, len(children))), node)
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Duplicate a node (deep copy) and insert it after the original.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"}
        }, "required": ["node_id"]}
    )
    def duplicate_node(node_id: str) -> dict:
        import copy
        node, parent_children, idx = _find_node(state.dsl, node_id)
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        clone = copy.deepcopy(node)
        clone["id"] = str(uuid.uuid4())[:8]
        parent_children.insert(idx + 1, clone)
        state.dirty = True
        return {"ok": True, "new_id": clone["id"]}

    @tool(
        description="Swap the product item referenced by a product node.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"},
            "new_item_id": {"type": "string"}
        }, "required": ["node_id", "new_item_id"]}
    )
    def swap_product(node_id: str, new_item_id: str) -> dict:
        node, _, _ = _find_node(state.dsl, node_id)
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        node["item_id"] = new_item_id
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Sort product nodes within a section by a field.",
        parameters={"type": "object", "properties": {
            "section_id": {"type": "string"},
            "by": {"type": "string", "enum": ["price_asc","price_desc","name_asc","discount_pct_desc","category"]}
        }, "required": ["section_id", "by"]}
    )
    def sort_products(section_id: str, by: str) -> dict:
        section, _, _ = _find_node(state.dsl, section_id)
        if section is None:
            return {"error": f"Section {section_id!r} not found"}
        product_nodes = [c for c in section.get("children", []) if c.get("type") == "product"]
        other_nodes = [c for c in section.get("children", []) if c.get("type") != "product"]

        def key_fn(n):
            item = state.items.get(n.get("item_id", ""), {})
            offer = float(item.get("offer_price") or 0)
            mrp = float(item.get("original_price") or 0)
            name = (item.get("display_name") or "").lower()
            disc = ((mrp - offer) / mrp) if mrp > 0 else 0
            if by == "price_asc":    return offer
            if by == "price_desc":   return -offer
            if by == "name_asc":     return name
            if by == "discount_pct_desc": return -disc
            return name

        product_nodes.sort(key=key_fn)
        section["children"] = other_nodes + product_nodes
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Adjust font scale globally. target: all/headings/prices/body. delta: +0.1 = 10% bigger.",
        parameters={"type": "object", "properties": {
            "target": {"type": "string", "enum": ["all","headings","prices","body"]},
            "delta": {"type": "number"}
        }, "required": ["target", "delta"]}
    )
    def adjust_font_scale(target: str, delta: float) -> dict:
        state.theme.setdefault("font_scale", {}).update({target: delta})
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Apply style overrides to a specific node.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"},
            "style_overrides": {"type": "object"}
        }, "required": ["node_id", "style_overrides"]}
    )
    def set_node_style(node_id: str, style_overrides: dict) -> dict:
        node, _, _ = _find_node(state.dsl, node_id)
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        node["style_overrides"] = style_overrides
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Return 5 suggested pamphlet title options (no mutation — user picks one).",
        parameters={"type": "object", "properties": {
            "focus": {"type": "string"},
            "count": {"type": "integer"}
        }, "required": []}
    )
    def suggest_titles(focus: str = "", count: int = 5) -> dict:
        return {"message": f"Please suggest {count} pamphlet titles{' focused on ' + focus if focus else ''}. List them numbered so the user can pick."}

    @tool(
        description="Set the pamphlet title text (heading node at top of page).",
        parameters={"type": "object", "properties": {
            "text": {"type": "string"}
        }, "required": ["text"]}
    )
    def set_pamphlet_title(text: str) -> dict:
        state.theme["title"] = text
        # Find first heading text node and update, or add one at top of page
        def find_heading(tree):
            for c in tree.get("children", []):
                if c.get("type") == "text" and c.get("variant") == "heading":
                    return c
                found = find_heading(c)
                if found:
                    return found
            return None
        heading = find_heading(state.dsl)
        if heading:
            heading["content"] = text
        state.dirty = True
        return {"ok": True, "text": text}

    @tool(
        description="List all product items available in this pamphlet.",
        parameters={"type": "object", "properties": {}, "required": []}
    )
    def list_available_items() -> dict:
        return {"items": [
            {"item_id": k, "name": v.get("display_name"), "offer_price": v.get("offer_price")}
            for k, v in state.items.items()
        ]}

    @tool(
        description="Ask the user a clarifying question (no DSL mutation).",
        parameters={"type": "object", "properties": {
            "question": {"type": "string"}
        }, "required": ["question"]}
    )
    def ask_clarification(question: str) -> dict:
        return {"clarification_needed": question}

    return [
        set_theme, update_theme_tokens, generate_theme,
        insert_node, update_node, remove_node, move_node, duplicate_node,
        swap_product, sort_products,
        adjust_font_scale, set_node_style,
        suggest_titles, set_pamphlet_title,
        list_available_items, ask_clarification,
    ]
```

- [ ] **Step 4: Run — expect pass**

Run: `python -m pytest tests/test_pamphlet_ai_tools.py -v`

- [ ] **Step 5: Commit**

```bash
git add api/tools/pamphlets/ai_tools.py tests/test_pamphlet_ai_tools.py
git commit -m "feat(pamphlets): 16 LLM tool functions — theme, layout, sort, style, title, clarification"
```

---

### Task 14: System prompt + ChatSession wiring

**Files:**
- Create: `api/tools/pamphlets/system_prompt.py`
- Create: `api/tools/pamphlets/ai_session.py`

- [ ] **Step 1: Create `api/tools/pamphlets/system_prompt.py`**

```python
from api.tools.pamphlets.themes import PRESET_IDS

SYSTEM_PROMPT = f"""You are a pamphlet design assistant for Puranic Health Mart, a supermarket in Bangalore.
You help staff create attractive promotional pamphlets by modifying a JSON DSL tree via tool calls.

## Your role
- Interpret natural-language design requests and translate them into precise tool calls
- Available themes: {", ".join(PRESET_IDS)}
- Never describe changes — always execute them via tools
- If a request is ambiguous, call ask_clarification before making changes
- Multiple tools in one turn is encouraged (e.g. set_theme + move_node + insert_node)

## Tone
- Retail-friendly, not medical claims
- Price copy: "Save ₹X" or "X% OFF" — always quantify discounts if data available
- Badge text: punchy 2–6 words

## Layout principles
- Products should always be in sections with layout=grid
- Offer banners work best centered in a slot with span_cols=full-width
- Use decorations sparingly — one per page max
- Contact strip always goes at the bottom

## Examples

User: "Make it monsoon themed"
→ set_theme(name="monsoon")

User: "Put a big sale banner in the middle, products on sides"
→ insert_node(parent_id="page_root", position=0, node={{type: section, layout: grid, cols: 3, ...}})
→ insert_node(parent_id=center_slot_id, position=0, node={{type: offer_banner, headline: "MEGA SALE", shape: strip}})

User: "Sort products cheapest first"
→ sort_products(section_id="<section_id>", by="price_asc")

User: "Make the heading bigger"
→ set_node_style(node_id="<heading_id>", style_overrides={{font_size_token: "2xl"}})

User: "Suggest a good title for a Diwali sale"
→ suggest_titles(focus="Diwali sale", count=5)
"""


def build_system_prompt(pamphlet_title: str, item_count: int) -> str:
    return SYSTEM_PROMPT + f"\n\n## Current pamphlet\nTitle: {pamphlet_title}\nProducts: {item_count}"
```

- [ ] **Step 2: Create `api/tools/pamphlets/ai_session.py`**

```python
from __future__ import annotations
from api.ai import ChatSession
from api.ai.config import get_default_provider, get_default_model
from api.ai.provider import Message
from api.tools.pamphlets.ai_tools import PamphletState, build_tools
from api.tools.pamphlets.system_prompt import build_system_prompt


def make_pamphlet_session(
    dsl: dict,
    theme: dict,
    items: dict[str, dict],
    pamphlet_title: str,
    history: list[Message],
    provider: str | None = None,
    model: str | None = None,
) -> tuple[ChatSession, PamphletState]:
    state = PamphletState(dsl=dsl, theme=theme, items=items)
    tools = build_tools(state)
    session = ChatSession(
        provider=provider or get_default_provider(),
        model=model or get_default_model(),
        system_prompt=build_system_prompt(pamphlet_title, len(items)),
        tools=tools,
        history=history,
    )
    return session, state
```

- [ ] **Step 3: Commit**

```bash
git add api/tools/pamphlets/system_prompt.py api/tools/pamphlets/ai_session.py
git commit -m "feat(pamphlets): system prompt with few-shot examples + ChatSession factory"
```

---

### Task 15: Service helpers for DSL/version/chat persistence

**Files:**
- Modify: `api/tools/pamphlets/service.py`

- [ ] **Step 1: Append to `api/tools/pamphlets/service.py`**

```python
# --- append to existing service.py ---
import uuid as _uuid
from datetime import datetime, timezone

from api.tools.pamphlets.models import PamphletVersion, PamphletChatMessage
from api.ai.provider import Message


VERSION_RETENTION = 50  # rolling window per pamphlet


def create_version(
    db: Session,
    pamphlet_id: str,
    dsl: dict,
    theme: dict,
    parent_version_id: str | None,
    user_id: str | None,
    edit_summary: str,
) -> PamphletVersion:
    version = PamphletVersion(
        id=_uuid.uuid4(),
        pamphlet_id=pamphlet_id,
        template_dsl=dsl,
        theme=theme,
        parent_version_id=parent_version_id,
        created_by=user_id,
        edit_summary=edit_summary,
    )
    db.add(version)
    db.flush()
    _prune_old_versions(db, pamphlet_id)
    return version


def _prune_old_versions(db: Session, pamphlet_id: str) -> None:
    versions = (
        db.query(PamphletVersion)
        .filter(PamphletVersion.pamphlet_id == pamphlet_id)
        .order_by(PamphletVersion.created_at.desc())
        .all()
    )
    for old in versions[VERSION_RETENTION:]:
        db.delete(old)


def list_versions(db: Session, pamphlet_id: str) -> list[PamphletVersion]:
    return (
        db.query(PamphletVersion)
        .filter(PamphletVersion.pamphlet_id == pamphlet_id)
        .order_by(PamphletVersion.created_at.desc())
        .all()
    )


def restore_version(db: Session, pamphlet_id: str, version_id: str, user_id: str) -> PamphletVersion | None:
    version = db.query(PamphletVersion).filter(PamphletVersion.id == version_id).first()
    if not version:
        return None
    pamphlet = get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        return None
    # Create a new version (restore = new snapshot, not deletion of history)
    new_version = create_version(
        db, pamphlet_id, version.template_dsl, version.theme,
        parent_version_id=str(pamphlet.current_version_id),
        user_id=user_id,
        edit_summary=f"Restored from version {str(version.id)[:8]}",
    )
    pamphlet.template_dsl = version.template_dsl
    pamphlet.theme = version.theme
    pamphlet.current_version_id = new_version.id
    return new_version


def save_chat_messages(
    db: Session,
    pamphlet_id: str,
    messages: list[Message],
    version_id: str | None,
    user_id: str | None,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: float,
) -> None:
    for msg in messages:
        if msg.role == "user" and not msg.tool_results and msg.content:
            db.add(PamphletChatMessage(
                id=_uuid.uuid4(), pamphlet_id=pamphlet_id,
                role="user", content=msg.content,
                user_id=user_id,
            ))
        elif msg.role == "assistant":
            db.add(PamphletChatMessage(
                id=_uuid.uuid4(), pamphlet_id=pamphlet_id,
                role="assistant", content=msg.content,
                version_id=version_id,
                provider=provider, model=model,
                prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                cost_usd=cost_usd,
            ))
        elif msg.role == "user" and msg.tool_results:
            for tr in msg.tool_results:
                db.add(PamphletChatMessage(
                    id=_uuid.uuid4(), pamphlet_id=pamphlet_id,
                    role="tool", tool_call_name=tr.name,
                    tool_call_result=tr.result if isinstance(tr.result, dict) else {"value": str(tr.result)},
                    version_id=version_id,
                ))


def load_chat_history(db: Session, pamphlet_id: str) -> list[Message]:
    rows = (
        db.query(PamphletChatMessage)
        .filter(PamphletChatMessage.pamphlet_id == pamphlet_id)
        .order_by(PamphletChatMessage.created_at)
        .all()
    )
    messages: list[Message] = []
    from api.ai.provider import ToolResult
    for row in rows:
        if row.role == "user" and row.content:
            messages.append(Message(role="user", content=row.content))
        elif row.role == "assistant":
            messages.append(Message(role="assistant", content=row.content))
    return messages


def get_items_lookup(db: Session, pamphlet_id: str) -> dict[str, dict]:
    items = get_pamphlet_items(db, pamphlet_id)
    return {
        str(item.id): {
            "display_name": item.display_name,
            "offer_price": float(item.offer_price) if item.offer_price else None,
            "original_price": float(item.original_price) if item.original_price else None,
            "highlight_text": item.highlight_text,
            "image_url": item.image_url,
        }
        for item in items
    }
```

- [ ] **Step 2: Add `from sqlalchemy.orm import Session` to top of service.py if missing**

- [ ] **Step 3: Commit**

```bash
git add api/tools/pamphlets/service.py
git commit -m "feat(pamphlets): DSL/version/chat persistence helpers in service.py"
```

---

### Task 16: New API endpoints (chat, versions, export-pdf, models list)

**Files:**
- Modify: `api/tools/pamphlets/router.py`
- Modify: `api/tools/pamphlets/schemas.py`

- [ ] **Step 1: Add schemas to `api/tools/pamphlets/schemas.py`**

Append to existing `schemas.py`:

```python
# Append to existing schemas.py

class ChatRequest(BaseModel):
    message: str
    provider: str | None = None
    model: str | None = None

class ToolCallInfo(BaseModel):
    tool_name: str
    args: dict
    result: Any
    is_error: bool

class ChatResponse(BaseModel):
    assistant_text: str | None
    tool_calls: list[ToolCallInfo]
    version_id: str | None
    dsl: dict
    theme: dict
    cost_usd: float
    provider: str
    model: str

class VersionResponse(BaseModel):
    id: str
    pamphlet_id: str
    edit_summary: str | None
    created_at: Any
    created_by: str | None

class ModelInfo(BaseModel):
    provider: str
    model: str
    display_name: str
```

Add `from typing import Any` at top of schemas.py if not present.

- [ ] **Step 2: Append endpoints to `api/tools/pamphlets/router.py`**

```python
# Append to existing router.py

from api.tools.pamphlets.render.html import render_pamphlet as render_html
from api.tools.pamphlets import service as svc
from api.tools.pamphlets.ai_session import make_pamphlet_session
from api.tools.pamphlets.schemas import ChatRequest, ChatResponse, ToolCallInfo, VersionResponse, ModelInfo
from api.ai.config import ALLOWED_MODELS


@router.post("/{pamphlet_id}/chat", response_model=ChatResponse)
def chat(
    pamphlet_id: str,
    body: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")

    dsl = pamphlet.template_dsl or {}
    theme = pamphlet.theme or {"preset": "minimal_light"}
    items = svc.get_items_lookup(db, pamphlet_id)
    history = svc.load_chat_history(db, pamphlet_id)

    session, state = make_pamphlet_session(
        dsl=dsl, theme=theme, items=items,
        pamphlet_title=pamphlet.title,
        history=history,
        provider=body.provider,
        model=body.model,
    )

    try:
        turn = session.send(body.message)
    except Exception as e:
        raise HTTPException(502, f"AI error: {e}")

    version = None
    if state.dirty:
        version = svc.create_version(
            db, pamphlet_id, state.dsl, state.theme,
            parent_version_id=str(pamphlet.current_version_id) if pamphlet.current_version_id else None,
            user_id=current_user.id,
            edit_summary=_summarize_turn(turn),
        )
        pamphlet.template_dsl = state.dsl
        pamphlet.theme = state.theme
        pamphlet.current_version_id = version.id

    svc.save_chat_messages(
        db, pamphlet_id, turn.new_messages,
        version_id=str(version.id) if version else None,
        user_id=current_user.id,
        provider=turn.provider, model=turn.model,
        prompt_tokens=turn.prompt_tokens, completion_tokens=turn.completion_tokens,
        cost_usd=float(turn.cost_usd),
    )
    db.commit()

    return ChatResponse(
        assistant_text=turn.assistant_text,
        tool_calls=[ToolCallInfo(tool_name=e.tool_name, args=e.args, result=e.result, is_error=e.is_error) for e in turn.tool_executions],
        version_id=str(version.id) if version else None,
        dsl=state.dsl,
        theme=state.theme,
        cost_usd=float(turn.cost_usd),
        provider=turn.provider,
        model=turn.model,
    )


@router.get("/{pamphlet_id}/versions", response_model=list[VersionResponse])
def get_versions(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    return [
        VersionResponse(
            id=str(v.id), pamphlet_id=str(v.pamphlet_id),
            edit_summary=v.edit_summary, created_at=v.created_at,
            created_by=str(v.created_by) if v.created_by else None,
        )
        for v in svc.list_versions(db, pamphlet_id)
    ]


@router.post("/{pamphlet_id}/versions/{version_id}/restore", response_model=VersionResponse)
def restore_version(
    pamphlet_id: str, version_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    version = svc.restore_version(db, pamphlet_id, version_id, current_user.id)
    if not version:
        raise HTTPException(404, "Version not found")
    db.commit()
    return VersionResponse(
        id=str(version.id), pamphlet_id=str(version.pamphlet_id),
        edit_summary=version.edit_summary, created_at=version.created_at,
        created_by=str(version.created_by) if version.created_by else None,
    )


@router.post("/{pamphlet_id}/export-pdf")
async def export_pdf(
    pamphlet_id: str,
    request: Request,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    from fastapi.responses import Response as FastAPIResponse
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")
    if not pamphlet.template_dsl:
        raise HTTPException(400, "Pamphlet has no DSL — use chat to generate a layout first")

    items = svc.get_items_lookup(db, pamphlet_id)
    html = render_html(pamphlet.template_dsl, pamphlet.theme or {}, items)

    browser = request.app.state.browser
    from api.tools.pamphlets.render.pdf import render_html_to_pdf
    try:
        pdf_bytes = await render_html_to_pdf(html, browser)
    except Exception as e:
        raise HTTPException(502, f"PDF render failed: {e}")

    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{pamphlet.title}.pdf"'},
    )


@router.get("/{pamphlet_id}/preview-html")
def preview_html(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    from fastapi.responses import HTMLResponse
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")
    if not pamphlet.template_dsl:
        return HTMLResponse("<html><body>No DSL yet — use chat to generate layout.</body></html>")
    items = svc.get_items_lookup(db, pamphlet_id)
    html = render_html(pamphlet.template_dsl, pamphlet.theme or {}, items)
    return HTMLResponse(html)


@router.get("/models", response_model=list[ModelInfo])
def list_models(_: CurrentUser = Depends(get_current_user)):
    result = []
    labels = {
        "claude-opus-4-7": "Claude Opus 4.7", "claude-sonnet-4-6": "Claude Sonnet 4.6",
        "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
        "gpt-4o": "GPT-4o", "gpt-4o-mini": "GPT-4o Mini", "gpt-4-turbo": "GPT-4 Turbo",
        "anthropic/claude-sonnet-4-6": "Claude Sonnet (OpenRouter)",
        "openai/gpt-4o": "GPT-4o (OpenRouter)",
        "meta-llama/llama-3.1-70b-instruct": "Llama 3.1 70B",
        "deepseek/deepseek-chat": "DeepSeek Chat",
    }
    for provider, models in ALLOWED_MODELS.items():
        for m in models:
            result.append(ModelInfo(provider=provider, model=m, display_name=labels.get(m, m)))
    return result


def _summarize_turn(turn) -> str:
    names = [e.tool_name for e in turn.tool_executions if not e.is_error]
    if not names:
        return "Chat (no changes)"
    unique = list(dict.fromkeys(names))
    return ", ".join(unique[:3]) + ("..." if len(unique) > 3 else "")
```

Add `from fastapi import Request` to existing imports in router.py.

- [ ] **Step 3: Smoke test endpoints**

Run server: `python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000`

Run: `curl http://localhost:8000/api/tools/pamphlets/models`
Expected: JSON array of model objects.

- [ ] **Step 4: Commit**

```bash
git add api/tools/pamphlets/router.py api/tools/pamphlets/schemas.py
git commit -m "feat(pamphlets): /chat, /versions, /restore, /export-pdf, /preview-html, /models endpoints"
```

---

## Phase 2 — Editor UX

### Task 17: Move legacy editor + create typed API client

**Files:**
- Move: `web/app/(internal)/tools/pamphlet-generator/[id]/page.tsx` → `web/app/(internal)/tools/pamphlet-generator/[id]/legacy/page.tsx`
- Create: `web/lib/pamphlet/types.ts`
- Create: `web/lib/pamphlet/api.ts`

- [ ] **Step 1: Create `web/app/(internal)/tools/pamphlet-generator/[id]/legacy/` directory and move file**

```bash
mkdir -p "web/app/(internal)/tools/pamphlet-generator/[id]/legacy"
mv "web/app/(internal)/tools/pamphlet-generator/[id]/page.tsx" "web/app/(internal)/tools/pamphlet-generator/[id]/legacy/page.tsx"
```

- [ ] **Step 2: Create `web/lib/pamphlet/types.ts`**

```typescript
export type NodeLang = "en" | "hi" | "kn";

export interface StyleOverrides {
  font_size_token?: "xs"|"sm"|"md"|"lg"|"xl"|"2xl";
  font_size_px?: number;
  font_weight?: "regular"|"medium"|"bold";
  color_token?: string;
  color_hex?: string;
  text_align?: "left"|"center"|"right";
  padding_token?: "xs"|"sm"|"md"|"lg";
  margin_token?: "xs"|"sm"|"md"|"lg";
}

export interface AnyNode {
  type: string;
  id: string;
  children?: AnyNode[];
  [key: string]: unknown;
}

export interface PamphletTheme {
  preset?: string;
  overrides?: Record<string, Record<string, string>>;
  title?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | null;
}

export interface ToolCallInfo {
  tool_name: string;
  args: Record<string, unknown>;
  result: unknown;
  is_error: boolean;
}

export interface ChatResponse {
  assistant_text: string | null;
  tool_calls: ToolCallInfo[];
  version_id: string | null;
  dsl: AnyNode;
  theme: PamphletTheme;
  cost_usd: number;
  provider: string;
  model: string;
}

export interface VersionInfo {
  id: string;
  pamphlet_id: string;
  edit_summary: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ModelInfo {
  provider: string;
  model: string;
  display_name: string;
}
```

- [ ] **Step 3: Create `web/lib/pamphlet/api.ts`**

```typescript
import { ChatResponse, VersionInfo, ModelInfo } from "./types";

const BASE = `/api/tools/pamphlets`;

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export async function sendChatMessage(
  pamphletId: string,
  message: string,
  provider?: string,
  model?: string
): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/${pamphletId}/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message, provider, model }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Chat failed");
  return res.json();
}

export async function listVersions(pamphletId: string): Promise<VersionInfo[]> {
  const res = await fetch(`${BASE}/${pamphletId}/versions`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load versions");
  return res.json();
}

export async function restoreVersion(pamphletId: string, versionId: string): Promise<VersionInfo> {
  const res = await fetch(`${BASE}/${pamphletId}/versions/${versionId}/restore`, {
    method: "POST", headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Restore failed");
  return res.json();
}

export async function exportPdf(pamphletId: string): Promise<Blob> {
  const res = await fetch(`${BASE}/${pamphletId}/export-pdf`, {
    method: "POST", headers: authHeaders(),
  });
  if (!res.ok) throw new Error("PDF export failed");
  return res.blob();
}

export function getPreviewUrl(pamphletId: string): string {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  return `${BASE}/${pamphletId}/preview-html?token=${token}`;
}

export async function listModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE}/models`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load models");
  return res.json();
}
```

- [ ] **Step 4: Commit**

```bash
git add "web/app/(internal)/tools/pamphlet-generator/[id]/legacy/" web/lib/pamphlet/
git commit -m "feat(pamphlets): move legacy editor, add typed API client + DSL types"
```

---

### Task 18: ModelDropdown + ToolCallPill components

**Files:**
- Create: `web/components/pamphlet/ModelDropdown.tsx`
- Create: `web/components/pamphlet/ToolCallPill.tsx`

- [ ] **Step 1: Create `web/components/pamphlet/ModelDropdown.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { listModels } from "@/lib/pamphlet/api";
import { ModelInfo } from "@/lib/pamphlet/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  value: string;
  onChange: (provider: string, model: string) => void;
}

export function ModelDropdown({ value, onChange }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    listModels().then(setModels).catch(console.error);
  }, []);

  return (
    <Select
      value={value}
      onValueChange={(val) => {
        const m = models.find((m) => `${m.provider}:${m.model}` === val);
        if (m) onChange(m.provider, m.model);
      }}
    >
      <SelectTrigger className="h-7 text-xs w-52">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {models.map((m) => (
          <SelectItem key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`} className="text-xs">
            {m.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Create `web/components/pamphlet/ToolCallPill.tsx`**

```tsx
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { ToolCallInfo } from "@/lib/pamphlet/types";

interface Props {
  toolCall: ToolCallInfo;
}

const TOOL_LABELS: Record<string, string> = {
  set_theme: "Set theme", update_theme_tokens: "Update tokens", generate_theme: "Generate theme",
  insert_node: "Insert node", update_node: "Update node", remove_node: "Remove node",
  move_node: "Move node", duplicate_node: "Duplicate node", swap_product: "Swap product",
  sort_products: "Sort products", adjust_font_scale: "Adjust font", set_node_style: "Style node",
  suggest_titles: "Suggest titles", set_pamphlet_title: "Set title",
  list_available_items: "List items", ask_clarification: "Ask clarification",
};

export function ToolCallPill({ toolCall }: Props) {
  const label = TOOL_LABELS[toolCall.tool_name] ?? toolCall.tool_name;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${toolCall.is_error ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
      {toolCall.is_error ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/components/pamphlet/ModelDropdown.tsx web/components/pamphlet/ToolCallPill.tsx
git commit -m "feat(pamphlets): ModelDropdown + ToolCallPill components"
```

---

### Task 19: ChatPanel component

**Files:**
- Create: `web/components/pamphlet/ChatPanel.tsx`

- [ ] **Step 1: Create `web/components/pamphlet/ChatPanel.tsx`**

```tsx
"use client";
import { useRef, useState, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelDropdown } from "./ModelDropdown";
import { ToolCallPill } from "./ToolCallPill";
import { ChatResponse, ToolCallInfo } from "@/lib/pamphlet/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
}

interface Props {
  pamphletId: string;
  onDslUpdate: (dsl: object, theme: object) => void;
  onSend: (message: string, provider: string, model: string) => Promise<ChatResponse>;
}

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-sonnet-4-6";

export function ChatPanel({ pamphletId, onDslUpdate, onSend }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const resp = await onSend(userMsg, provider, model);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: resp.assistant_text ?? "",
          toolCalls: resp.tool_calls,
        },
      ]);
      onDslUpdate(resp.dsl, resp.theme);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full border-r">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground">Model</span>
        <ModelDropdown
          value={`${provider}:${model}`}
          onChange={(p, m) => { setProvider(p); setModel(m); }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">
            Describe the pamphlet layout you want.<br />
            Try: "Monsoon theme, offer banner in center, products around it"
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`rounded-lg px-3 py-2 text-sm max-w-[90%] whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {msg.content}
            </div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="flex flex-wrap gap-1 max-w-[90%]">
                {msg.toolCalls.map((tc, j) => <ToolCallPill key={j} toolCall={tc} />)}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
            placeholder="Describe a change..."
            className="min-h-[60px] max-h-32 resize-none text-sm"
            disabled={loading}
          />
          <Button size="icon" onClick={handleSend} disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/components/pamphlet/ChatPanel.tsx
git commit -m "feat(pamphlets): ChatPanel with model picker, tool-call pills, scroll-to-bottom"
```

---

### Task 20: PreviewIframe + HistoryDrawer

**Files:**
- Create: `web/components/pamphlet/PreviewIframe.tsx`
- Create: `web/components/pamphlet/HistoryDrawer.tsx`

- [ ] **Step 1: Create `web/components/pamphlet/PreviewIframe.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  pamphletId: string;
  dsl: object | null;
  theme: object | null;
  refreshKey: number;
}

export function PreviewIframe({ pamphletId, dsl, theme, refreshKey }: Props) {
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";

  const src = `/api/tools/pamphlets/${pamphletId}/preview-html`;

  useEffect(() => {
    if (!pamphletId) return;
    setLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = src + `?t=${refreshKey}&token=${token}`;
    }
  }, [refreshKey, pamphletId]);

  return (
    <div className="relative w-full h-full bg-muted/20 flex items-center justify-center overflow-auto">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <iframe
        ref={iframeRef}
        sandbox="allow-same-origin allow-scripts"
        className="shadow-lg"
        style={{ width: "297mm", height: "210mm", border: "none", transform: "scale(0.75)", transformOrigin: "top center" }}
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `web/components/pamphlet/HistoryDrawer.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { listVersions, restoreVersion } from "@/lib/pamphlet/api";
import { VersionInfo } from "@/lib/pamphlet/types";

interface Props {
  pamphletId: string;
  onRestore: () => void;
}

export function HistoryDrawer({ pamphletId, onRestore }: Props) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (open) listVersions(pamphletId).then(setVersions).catch(console.error);
  }, [open, pamphletId]);

  async function handleRestore(versionId: string) {
    setRestoring(versionId);
    try {
      await restoreVersion(pamphletId, versionId);
      onRestore();
      setOpen(false);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <History className="w-4 h-4" /> History
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Version History</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 overflow-y-auto max-h-[80vh]">
          {versions.length === 0 && <p className="text-xs text-muted-foreground">No versions yet.</p>}
          {versions.map((v) => (
            <div key={v.id} className="flex items-start justify-between gap-2 p-2 rounded border text-xs">
              <div>
                <p className="font-medium">{v.edit_summary || "Edit"}</p>
                <p className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}</p>
              </div>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                onClick={() => handleRestore(v.id)}
                disabled={restoring === v.id}
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/components/pamphlet/PreviewIframe.tsx web/components/pamphlet/HistoryDrawer.tsx
git commit -m "feat(pamphlets): PreviewIframe (iframe srcDoc) + HistoryDrawer (versions list + restore)"
```

---

### Task 21: New editor page (side-by-side layout)

**Files:**
- Create: `web/app/(internal)/tools/pamphlet-generator/[id]/page.tsx`

- [ ] **Step 1: Create new editor page**

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/pamphlet/ChatPanel";
import { PreviewIframe } from "@/components/pamphlet/PreviewIframe";
import { HistoryDrawer } from "@/components/pamphlet/HistoryDrawer";
import { sendChatMessage, exportPdf } from "@/lib/pamphlet/api";

export default function PamphletEditorPage() {
  const params = useParams();
  const router = useRouter();
  const pamphletId = params.id as string;

  const [dsl, setDsl] = useState<object | null>(null);
  const [theme, setTheme] = useState<object | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [title, setTitle] = useState("Pamphlet");

  useEffect(() => {
    // Fetch pamphlet to check if it has DSL or needs legacy route
    const token = localStorage.getItem("token");
    fetch(`/api/tools/pamphlets/${pamphletId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setTitle(data.title ?? "Pamphlet");
        if (!data.template_dsl && data.template_type !== "dsl") {
          // Legacy pamphlet — redirect to legacy editor
          router.replace(`/tools/pamphlet-generator/${pamphletId}/legacy`);
        } else {
          setDsl(data.template_dsl);
          setTheme(data.theme);
        }
      })
      .catch(console.error);
  }, [pamphletId]);

  const handleDslUpdate = useCallback((newDsl: object, newTheme: object) => {
    setDsl(newDsl);
    setTheme(newTheme);
    setPreviewKey((k) => k + 1);
  }, []);

  const handleSend = useCallback(
    (message: string, provider: string, model: string) =>
      sendChatMessage(pamphletId, message, provider, model),
    [pamphletId]
  );

  async function handleExportPdf() {
    setExporting(true);
    try {
      const blob = await exportPdf(pamphletId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/tools/pamphlet-generator")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-sm font-semibold flex-1 truncate">{title}</h1>
        <HistoryDrawer pamphletId={pamphletId} onRestore={() => setPreviewKey((k) => k + 1)} />
        <Button size="sm" onClick={handleExportPdf} disabled={exporting || !dsl} className="gap-1">
          <Download className="w-4 h-4" />
          {exporting ? "Exporting..." : "Export PDF"}
        </Button>
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel — 30% */}
        <div className="w-[30%] min-w-[280px] flex flex-col overflow-hidden">
          <ChatPanel
            pamphletId={pamphletId}
            onDslUpdate={handleDslUpdate}
            onSend={handleSend}
          />
        </div>

        {/* Preview panel — 70% */}
        <div className="flex-1 overflow-auto">
          <PreviewIframe
            pamphletId={pamphletId}
            dsl={dsl}
            theme={theme}
            refreshKey={previewKey}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify routing**

Start dev server: `cd web && npm run dev`
Navigate to `http://localhost:3000/tools/pamphlet-generator/<id>` for a legacy pamphlet.
Expected: redirects to `/legacy`.
Navigate with a new DSL pamphlet.
Expected: shows chat + preview layout.

- [ ] **Step 3: Commit**

```bash
git add "web/app/(internal)/tools/pamphlet-generator/[id]/page.tsx"
git commit -m "feat(pamphlets): new DSL editor page — side-by-side chat + iframe preview + toolbar"
```

---

### Task 22: New DSL pamphlet creation flow

**Files:**
- Modify: `web/app/(internal)/tools/pamphlet-generator/page.tsx`

- [ ] **Step 1: Add "New (DSL)" button to list page**

Read `web/app/(internal)/tools/pamphlet-generator/page.tsx`, find the existing "New Pamphlet" button, and add a second button that creates a pamphlet with `template_type: "dsl"` and an initial minimal DSL:

```tsx
async function createDslPamphlet() {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/tools/pamphlets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "New Pamphlet",
      template_type: "dsl",
      rows: null,
      cols: null,
      items: [],
    }),
  });
  const data = await res.json();
  router.push(`/tools/pamphlet-generator/${data.id}`);
}
```

Add button next to existing "New Pamphlet":
```tsx
<Button onClick={createDslPamphlet} variant="default">
  + New Pamphlet (AI)
</Button>
```

- [ ] **Step 2: Commit**

```bash
git add "web/app/(internal)/tools/pamphlet-generator/page.tsx"
git commit -m "feat(pamphlets): add 'New Pamphlet (AI)' button that creates DSL pamphlet"
```

---

## Phase 3 — Sanitizers + SSE streaming + `generate_theme`

### Task 23: Escape-hatch sanitizers

**Files:**
- Create: `api/tools/pamphlets/render/validator.py`
- Create: `tests/test_pamphlet_sanitize.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_pamphlet_sanitize.py
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
```

- [ ] **Step 2: Run — expect fail**

Run: `python -m pytest tests/test_pamphlet_sanitize.py -v`

- [ ] **Step 3: Create `api/tools/pamphlets/render/validator.py`**

```python
import bleach
from lxml import etree

_ALLOWED_HTML_TAGS = ["p","div","span","b","i","u","strong","em","br","img","a","ul","ol","li","h1","h2","h3","h4","table","tr","td","th"]
_ALLOWED_HTML_ATTRS = {"*": ["style","class"],"img": ["src","alt","width","height"],"a": ["href"]}
_ALLOWED_SVG_TAGS = {"svg","g","path","circle","rect","ellipse","line","polyline","polygon","text","tspan","defs","use","symbol","clipPath","mask","linearGradient","radialGradient","stop","filter","feGaussianBlur","title","desc"}
_ALLOWED_SVG_ATTRS = {"*": ["id","class","style","fill","stroke","stroke-width","opacity","transform","d","cx","cy","r","x","y","width","height","viewBox","xmlns","preserveAspectRatio","rx","ry","x1","y1","x2","y2","points","offset","stop-color","stop-opacity","gradientUnits","gradientTransform"]}
_FORBIDDEN_SVG_TAGS = {"script","foreignObject","animate","animateTransform","animateMotion","set"}


def sanitize_html(html: str) -> str:
    return bleach.clean(html, tags=_ALLOWED_HTML_TAGS, attributes=_ALLOWED_HTML_ATTRS, strip=True)


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
    # Remove forbidden attrs
    for attr in list(el.attrib.keys()):
        local = attr.split("}")[-1] if "}" in attr else attr
        if local.startswith("on") or local in ("href", "xlink:href"):
            del el.attrib[attr]
    for child in list(el):
        _clean_svg_element(child)
```

- [ ] **Step 4: Run — expect pass**

Run: `python -m pytest tests/test_pamphlet_sanitize.py -v`

- [ ] **Step 5: Wire sanitizers into router** — in `router.py` chat endpoint, after `state.dirty` check, sanitize any `custom_html` and `raw_svg` nodes before saving DSL:

```python
# In chat endpoint, before db.commit():
from api.tools.pamphlets.render.validator import sanitize_html, sanitize_svg

def _sanitize_dsl_inplace(node: dict) -> None:
    if node.get("type") == "custom_html" and "html" in node:
        node["html"] = sanitize_html(node["html"])
    if node.get("type") == "raw_svg" and "svg" in node:
        node["svg"] = sanitize_svg(node["svg"])
    for child in node.get("children", []):
        _sanitize_dsl_inplace(child)

if state.dirty:
    _sanitize_dsl_inplace(state.dsl)
    # ... existing version creation code
```

- [ ] **Step 6: Commit**

```bash
git add api/tools/pamphlets/render/validator.py tests/test_pamphlet_sanitize.py api/tools/pamphlets/router.py
git commit -m "feat(pamphlets): bleach+lxml sanitizers for custom_html and raw_svg escape hatches"
```

---

### Task 24: `generate_theme` real implementation + `/api/ai/models` global route

**Files:**
- Modify: `api/tools/pamphlets/ai_tools.py`
- Modify: `api/main.py`

- [ ] **Step 1: Implement `generate_theme` in `ai_tools.py`**

Replace the stub `generate_theme` function inside `build_tools`:

```python
@tool(
    description="Generate a new theme from a text description (e.g. 'rainy dark blue moody'). Calls LLM to produce color tokens.",
    parameters={"type": "object", "properties": {"description": {"type": "string"}}, "required": ["description"]}
)
def generate_theme(description: str) -> dict:
    import os, json
    import anthropic as sdk
    client = sdk.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    prompt = f"""Generate a retail pamphlet color theme for: "{description}"
Return ONLY valid JSON with this exact structure, no prose:
{{
  "colors": {{
    "primary": "#rrggbb", "secondary": "#rrggbb", "accent": "#rrggbb",
    "bg": "#rrggbb", "surface": "#rrggbb", "text": "#rrggbb",
    "text_muted": "#rrggbb", "border": "#rrggbb", "success": "#rrggbb", "danger": "#rrggbb"
  }},
  "decoration": {{"bg_gradient": "linear-gradient(...)"}}
}}
Rules: colors must be hex. bg and surface must be light if bg is light, dark if dark. accent must pop."""
    resp = client.messages.create(model="claude-haiku-4-5-20251001", max_tokens=512,
                                   messages=[{"role": "user", "content": prompt}])
    raw = resp.content[0].text.strip().strip("```json").strip("```").strip()
    tokens = json.loads(raw)
    state.theme = {"preset": "minimal_light", "overrides": tokens}
    state.dirty = True
    return {"ok": True, "tokens": tokens}
```

- [ ] **Step 2: Add global `/api/ai/models` route to `api/main.py`**

```python
# In api/main.py after app creation, add:
from fastapi.responses import JSONResponse
from api.ai.config import ALLOWED_MODELS

@app.get("/api/ai/models")
def get_all_models():
    return [
        {"provider": p, "model": m}
        for p, models in ALLOWED_MODELS.items()
        for m in models
    ]
```

- [ ] **Step 3: Commit**

```bash
git add api/tools/pamphlets/ai_tools.py api/main.py
git commit -m "feat(ai): real generate_theme (calls Haiku for palette) + global /api/ai/models endpoint"
```

---

### Task 25: Refactor existing highlight endpoint to use global AI module

**Files:**
- Modify: `api/tools/pamphlets/ai.py`

- [ ] **Step 1: Rewrite `api/tools/pamphlets/ai.py`**

```python
import json
import os
from api.tools.pamphlets.models import PamphletItem
from api.ai import ChatSession
from api.ai.tools import tool


def generate_highlights(items: list[PamphletItem]) -> list[dict]:
    if not items:
        return []

    lines = []
    for i, item in enumerate(items, 1):
        name = item.display_name or item.barcode or "Product"
        mrp = f"₹{item.original_price}" if item.original_price else "N/A"
        offer = f"₹{item.offer_price}" if item.offer_price else "N/A"
        lines.append(f"{i}. id={item.id} | {name} | MRP {mrp} | Offer {offer}")

    results: list[dict] = []

    @tool(
        description="Return highlight text for each product.",
        parameters={"type": "object", "properties": {
            "highlights": {"type": "array", "items": {"type": "object", "properties": {
                "id": {"type": "string"}, "highlight_text": {"type": "string"}
            }, "required": ["id", "highlight_text"]}}
        }, "required": ["highlights"]}
    )
    def submit_highlights(highlights: list) -> dict:
        results.extend(highlights)
        return {"ok": True}

    session = ChatSession(
        provider="anthropic",
        model="claude-haiku-4-5-20251001",
        system_prompt="You write punchy 2-6 word retail badge text for pamphlet products. No medical claims.",
        tools=[submit_highlights],
    )
    product_list = "\n".join(lines)
    session.send(
        f"Write highlight_text for each product. Call submit_highlights with all results.\n\n{product_list}"
    )
    return results if results else []
```

- [ ] **Step 2: Run existing test**

Run: `python -m pytest tests/ -k "highlight" -v` (if any)
Expected: no regressions.

- [ ] **Step 3: Commit**

```bash
git add api/tools/pamphlets/ai.py
git commit -m "refactor(pamphlets): highlight generator uses global ChatSession + @tool, removes direct Anthropic SDK call"
```

---

## Phase 4 — Migration + retire legacy

### Task 26: Legacy pamphlet migration script

**Files:**
- Create: `scripts/migrate_pamphlets_to_dsl.py`

- [ ] **Step 1: Create migration script**

```python
#!/usr/bin/env python
"""Migrate legacy grid pamphlets to DSL format.

Run: PYTHONPATH=. python scripts/migrate_pamphlets_to_dsl.py [--dry-run]
"""
import sys
import uuid
import argparse
from datetime import datetime, timezone

from config.db import SessionLocal
from api.tools.pamphlets.models import Pamphlet, PamphletItem, PamphletVersion

DRY_RUN = "--dry-run" in sys.argv


def items_to_grid_dsl(pamphlet: Pamphlet, items: list[PamphletItem]) -> dict:
    cols = pamphlet.cols or 5
    slots = []
    for item in sorted(items, key=lambda x: x.sort_order or 0):
        slots.append({
            "type": "slot", "id": str(uuid.uuid4())[:8],
            "children": [{
                "type": "product", "id": str(uuid.uuid4())[:8],
                "item_id": str(item.id),
                "layout": "card", "show_image": True, "show_mrp": True,
                "show_offer": True, "show_badge": True,
            }]
        })
    return {
        "type": "page", "id": str(uuid.uuid4())[:8],
        "theme_id": "minimal_light",
        "children": [{
            "type": "section", "id": str(uuid.uuid4())[:8],
            "layout": "grid", "cols": cols, "gap": "sm",
            "children": slots,
        }]
    }


def main():
    db = SessionLocal()
    try:
        pamphlets = db.query(Pamphlet).filter(Pamphlet.template_dsl.is_(None)).all()
        print(f"Found {len(pamphlets)} legacy pamphlets to migrate")

        for p in pamphlets:
            items = db.query(PamphletItem).filter(PamphletItem.pamphlet_id == p.id).all()
            dsl = items_to_grid_dsl(p, items)
            theme = {"preset": "minimal_light"}

            version = PamphletVersion(
                id=uuid.uuid4(),
                pamphlet_id=p.id,
                template_dsl=dsl,
                theme=theme,
                edit_summary="Migrated from legacy grid",
            )

            if not DRY_RUN:
                db.add(version)
                db.flush()
                p.template_dsl = dsl
                p.theme = theme
                p.template_type = "dsl"
                p.current_version_id = version.id

            print(f"  {'[DRY] ' if DRY_RUN else ''}Migrated: {p.title} ({len(items)} items, {p.cols or 5} cols)")

        if not DRY_RUN:
            db.commit()
            print("Migration committed.")
        else:
            print("Dry run complete — no changes written.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Dry run**

Run: `PYTHONPATH=. python scripts/migrate_pamphlets_to_dsl.py --dry-run`
Expected: lists existing pamphlets, no DB changes.

- [ ] **Step 3: Run migration**

Run: `PYTHONPATH=. python scripts/migrate_pamphlets_to_dsl.py`
Expected: each pamphlet migrated. Verify: `psql -U postgres -d axonflux -c "SELECT title, template_type FROM app.pamphlets;"`

- [ ] **Step 4: Verify migrated pamphlets render**

Pick a migrated pamphlet id, visit `http://localhost:3000/tools/pamphlet-generator/<id>`.
Expected: DSL editor loads (not legacy redirect), preview shows product grid.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate_pamphlets_to_dsl.py
git commit -m "feat(pamphlets): migration script — legacy grid → DSL with minimal_light theme"
```

---

### Task 27: Final smoke test + remove legacy redirect

- [ ] **Step 1: Full smoke test**

Run all tests:
```bash
python -m pytest tests/test_ai_module.py tests/test_ai_config.py tests/test_pamphlet_primitives.py tests/test_pamphlet_render_html.py tests/test_pamphlet_ai_tools.py tests/test_pamphlet_sanitize.py -v
```
Expected: all pass.

- [ ] **Step 2: End-to-end manual test**

1. Start API: `python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000`
2. Start frontend: `cd web && npm run dev`
3. Login as staff user
4. Click "New Pamphlet (AI)"
5. Type: `"Set monsoon theme and add a 3-column product grid"`
6. Verify: preview iframe updates, theme changes to blue/rain tones
7. Type: `"Add offer banner in the middle of the grid"`
8. Verify: offer_banner node appears centered
9. Click "Export PDF" — verify PDF downloads, opens correctly in viewer
10. Click "History" — verify version entries listed, click restore

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(pamphlets): complete DSL+AI pamphlet rewrite — chat-driven layout, Playwright PDF, 5 themes, multi-lang"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| LLM generates DSL via tool calls, not JSX | Tasks 8–9 (ChatSession + tools) |
| Chat-driven edits (monsoon theme, offer block) | Tasks 13–14 (ai_tools, system_prompt) |
| B+escape hatch DSL (custom_html, raw_svg) | Task 9 (primitives), Task 23 (sanitizers) |
| HTML → Playwright PDF, same render path | Tasks 11–12 |
| 5 themes + generate_theme | Tasks 10, 24 |
| Multi-provider AI (Anthropic, OpenAI, OpenRouter) | Tasks 7–8 |
| Global `api/ai/` module | Tasks 3–9 |
| Snapshot per assistant turn, rolling 50 | Task 15 |
| Chat history forever | Task 15 |
| Model dropdown per chat turn | Tasks 18–19 |
| History drawer + restore | Task 20 |
| PDF export sync | Task 16 |
| Side-by-side editor layout | Task 21 |
| Legacy pamphlets preserved | Task 17 (redirect), Task 26 (migration) |
| Sanitizers for escape hatches | Task 23 |
| Font size per-node style_overrides | Task 9 (StyleOverrides) + Task 13 (set_node_style) |
| Sort products by field | Task 13 (sort_products) |
| Header title suggestion | Task 13 (suggest_titles, set_pamphlet_title) |
| price_compare_block | Task 9 (PriceCompareNode), Task 11 (renderer) |
| Multi-lang Kannada/Hindi fonts | Tasks 10–11 |
| Refactor existing highlight endpoint | Task 25 |
| Migration script | Task 26 |

### No placeholders found ✓

### Type consistency check

- `PamphletState.dsl: dict` → used as `dict` throughout ai_tools ✓
- `AnyNode` discriminated union uses `"type"` field → all primitives have `type: Literal[...]` ✓
- `ChatResponse.dsl: dict` matches `state.dsl: dict` in router ✓
- `VersionResponse.id: str` matches `str(version.id)` in router ✓
- `TurnResult.tool_executions: list[ToolExecution]` → `ToolCallInfo` in schema maps all fields ✓

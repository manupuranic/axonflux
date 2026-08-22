"""Label-blind Phase 5B name-semantic evaluation helpers.

This module is intentionally evaluation-only.  It neither writes cleanup
application tables nor changes suggestions, decisions, or exports.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Literal

import openpyxl
from pydantic import BaseModel, ConfigDict, Field, model_validator

from api.ai.provider import Message
from api.ai.providers.openai import OpenAIProvider
from api.ai.tools import Tool


GROUND_TRUTH_SHA256 = "15da731ce5dcec5590f091ba0425ab1a9aa1e0253a23459fdb72e71fbf8fe6b1"
TOOL_NAME = "submit_name_semantic_assessment"
HumanLabel = Literal["CORRECTION", "NO_CHANGE", "UNCERTAIN"]


class NameChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    original_text: str = Field(min_length=1, max_length=120)
    replacement_text: str = Field(min_length=1, max_length=120)
    change_type: Literal["SPELLING", "ABBREVIATION", "TRUNCATION", "STRUCTURAL", "OTHER"]


class NameSemanticOutput(BaseModel):
    """The existing Phase 5B result vocabulary with bounded correction detail."""

    model_config = ConfigDict(extra="forbid")

    result: HumanLabel
    confidence: Literal["HIGH", "MEDIUM", "LOW"]
    reason: str = Field(min_length=1, max_length=500)
    suggested_name: str | None = Field(default=None, max_length=120)
    changes: list[NameChange] = Field(default_factory=list, max_length=1)

    @model_validator(mode="after")
    def enforce_minimal_edit(self):
        if self.result == "CORRECTION":
            if not self.suggested_name or len(self.changes) != 1:
                raise ValueError("CORRECTION requires one minimal replacement and suggested_name")
        elif self.suggested_name is not None or self.changes:
            raise ValueError("NO_CHANGE and UNCERTAIN must not contain correction details")
        return self


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_ground_truth(path: Path) -> list[dict]:
    """Load the immutable submitted workbook and retain labels only for scoring."""
    if _sha256(path) != GROUND_TRUTH_SHA256:
        raise ValueError(f"Unexpected ground-truth workbook hash: {path}")
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook["Evaluation"]
        values = list(sheet.values)
    finally:
        workbook.close()
    headers = [str(value) for value in values[0]]
    required = {
        "Item_Id", "Effective Item Name", "Suspicious token", "Proposed lexical neighbor",
        "Detector reason", "Corroborating evidence", "Human Label", "Human Corrected Name", "Human Notes",
    }
    if set(headers) != required:
        raise ValueError("Ground-truth workbook headers do not match the accepted Phase 5B evaluation schema")
    rows = []
    for values_row in values[1:]:
        source = dict(zip(headers, list(values_row) + [None] * (len(headers) - len(values_row))))
        label = str(source["Human Label"] or "").strip().upper()
        if label not in {"CORRECTION", "NO_CHANGE", "UNCERTAIN"}:
            raise ValueError(f"Invalid human label for Item_Id {source['Item_Id']}: {label!r}")
        rows.append({
            "item_id": str(source["Item_Id"]),
            "effective_item_name": str(source["Effective Item Name"] or ""),
            "suspicious_token": str(source["Suspicious token"] or ""),
            "lexical_neighbor": str(source["Proposed lexical neighbor"] or ""),
            "detector_reason": str(source["Detector reason"] or ""),
            "corroborating_evidence": str(source["Corroborating evidence"] or ""),
            "human_label": label,
            "human_corrected_name": source["Human Corrected Name"],
            "human_notes": source["Human Notes"],
        })
    if len(rows) != 61:
        raise ValueError(f"Expected 61 ground-truth rows; found {len(rows)}")
    return rows


def build_production_payload(row: dict, *, purchase_names: list[str], catalog_siblings: list[str]) -> dict:
    """Construct only the context available to a production name evaluator."""
    return {
        "candidate": {
            "item_id": row["item_id"],
            "effective_item_name": row["effective_item_name"],
            "suspicious_token": row["suspicious_token"],
            "lexical_neighbor": row["lexical_neighbor"],
            "detector_reason": row["detector_reason"],
            "corroborating_evidence": row["corroborating_evidence"],
        },
        "context": {
            "purchase_item_names": purchase_names[:5],
            "catalog_siblings": catalog_siblings[:5],
        },
    }


def human_minimal_replacement(row: dict) -> str:
    """Derive the approved minimal replacement from token or full-name labels."""
    original = row["effective_item_name"]
    token = row["suspicious_token"]
    corrected = str(row["human_corrected_name"] or "")
    prefix, suffix = original.split(token, 1)
    if corrected.startswith(prefix) and corrected.endswith(suffix):
        end = len(corrected) - len(suffix) if suffix else len(corrected)
        return corrected[len(prefix):end]
    return corrected


def minimal_edit_violations(output: NameSemanticOutput, *, original_item_name: str, suspicious_token: str) -> list[str]:
    """Verify form only; never infer or repair a semantic correction."""
    if output.result != "CORRECTION":
        return []
    change = output.changes[0]
    violations = []
    if change.original_text != suspicious_token:
        violations.append("original_text does not exactly match the suspicious token")
    if original_item_name.count(change.original_text) != 1:
        violations.append("declared original_text does not occur exactly once in the original item name")
        return violations
    expected = original_item_name.replace(change.original_text, change.replacement_text)
    if output.suggested_name != expected:
        violations.append("suggested_name is not the original item name with only the declared replacement applied")
    return violations


def name_semantic_tool() -> Tool:
    return Tool(
        name=TOOL_NAME,
        description="Submit a label-blind assessment of a proposed product-name correction.",
        parameters=NameSemanticOutput.model_json_schema(),
        func=lambda **kwargs: kwargs,
    )


def name_semantic_system_prompt() -> str:
    return """You assess one retail product-name correction candidate. Use only the supplied JSON evidence; do not use outside product or brand knowledge. The candidate may be a legitimate brand, local term, ordinary descriptor, model identifier, or a genuine error.

Return exactly one submit_name_semantic_assessment tool call.

Safety policy: a false correction of legitimate brand, local, model, product, or other intentional terminology is more dangerous than abstaining or missing a typo. Exact same-item historical purchase names that repeatedly preserve the suspicious token are strong evidence that the token may be intentional. That evidence outweighs unrelated catalog siblings which merely contain a lexically similar replacement. Catalog siblings are supporting evidence only; when same-item evidence consistently preserves the token and no stronger evidence proves an error, choose NO_CHANGE or UNCERTAIN.

Choose CORRECTION only when the supplied evidence supports a genuine name error. For CORRECTION, supply exactly one minimal token/phrase replacement in changes. Set suggested_name to the complete original effective_item_name with exactly that replacement applied. Preserve every other character exactly: do not normalize spacing, punctuation, capitalization, units, brand formatting, descriptors, other spelling, or word order. Choose NO_CHANGE for legitimate terminology. Choose UNCERTAIN when evidence cannot distinguish an error from valid terminology. For NO_CHANGE or UNCERTAIN, do not return suggested_name or changes."""


def validate_name_tool_call(name: str, arguments: dict) -> NameSemanticOutput:
    if name != TOOL_NAME:
        raise ValueError("Name evaluator returned an unexpected tool")
    return NameSemanticOutput.model_validate(arguments)


def evaluate_name(payload: dict, *, model: str = "gpt-4o"):
    completion = OpenAIProvider(api_key_provider="openai").complete(
        messages=[Message(role="user", content=json.dumps(payload))],
        system=name_semantic_system_prompt(),
        tools=[name_semantic_tool()],
        model=model,
        tool_choice="required",
    )
    if len(completion.message.tool_calls) != 1:
        raise ValueError("Name evaluator did not return exactly one assessment tool call")
    call = completion.message.tool_calls[0]
    return validate_name_tool_call(call.name, call.arguments), completion

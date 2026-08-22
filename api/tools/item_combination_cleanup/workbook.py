"""ER4U Item Combination workbook parse / identity-copy / invariant validation.

Phase 1 does not rewrite business data. Export is a file copy of the uploaded
workbook, then a cell-level comparison against the source.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet

REQUIRED_COLUMNS = (
    "Item_Id",
    "Barcode",
    "Item Name",
    "HsnCode",
    "Brand",
    "Size",
)

# Future mutable columns. Phase 1 does not change them, but the validator
# already treats them as the only cells allowed to differ.
MUTABLE_COLUMNS = frozenset({"Item Name", "HsnCode", "Brand", "Size"})

_HEADER_SCAN_ROWS = 10


class WorkbookError(Exception):
    """Upload/parse failure (bad file, missing columns, duplicate Item_Id)."""


class WorkbookValidationError(Exception):
    """Source vs output invariant failure. Export must be blocked."""


@dataclass(frozen=True)
class WorkbookMeta:
    sheet_name: str
    header_row: int
    headers: tuple[str, ...]
    data_row_count: int
    column_count: int


@dataclass(frozen=True)
class SourceRow:
    row_index: int
    item_id: object
    barcode: object
    item_name: object
    hsn: object
    brand: object
    size: object
    mrp: object
    rate: object
    purchase_price: object
    expiry: object
    stock: object


def _norm_header(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\xa0", " ").replace("\n", " ").strip()


def _item_id_key(value: object) -> str | None:
    """Identity key for duplicate detection without rewriting the cell.

    String values keep leading zeros. Integer-valued floats collapse to int
    text only for comparison (Excel often stores 1 as 1.0).
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return repr(value)
    text = str(value)
    if text.strip() == "":
        return None
    return text


def _open_xlsx(path: Path):
    try:
        return load_workbook(path, data_only=False, read_only=False)
    except Exception as exc:
        raise WorkbookError("File is not a valid XLSX workbook.") from exc


def _header_map(ws: Worksheet, header_row: int) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for col in range(1, (ws.max_column or 1) + 1):
        name = _norm_header(ws.cell(header_row, col).value)
        if name:
            mapping[name] = col
    return mapping


def _find_header_row(ws: Worksheet) -> int | None:
    required = set(REQUIRED_COLUMNS)
    scan_to = min(ws.max_row or 1, _HEADER_SCAN_ROWS)
    for row in range(1, scan_to + 1):
        names = {
            _norm_header(ws.cell(row, col).value)
            for col in range(1, (ws.max_column or 1) + 1)
        }
        if required.issubset(names):
            return row
    return None


def inspect_workbook(path: Path) -> WorkbookMeta:
    """Parse headers and identity columns. Does not rewrite the file."""
    wb = _open_xlsx(path)
    try:
        preferred = None
        for name in wb.sheetnames:
            if name.strip() == "Item_Master_List":
                preferred = wb[name]
                break
        candidates = [preferred] if preferred is not None else []
        candidates.extend(wb[name] for name in wb.sheetnames if wb[name] not in candidates)

        chosen: Worksheet | None = None
        header_row: int | None = None
        for ws in candidates:
            found = _find_header_row(ws)
            if found is not None:
                chosen = ws
                header_row = found
                break

        if chosen is None or header_row is None:
            raise WorkbookError(
                "Workbook is missing required columns: " + ", ".join(REQUIRED_COLUMNS)
            )

        headers_map = _header_map(chosen, header_row)
        missing = [c for c in REQUIRED_COLUMNS if c not in headers_map]
        if missing:
            raise WorkbookError(
                "Workbook is missing required columns: " + ", ".join(missing)
            )

        item_id_col = headers_map["Item_Id"]
        seen: dict[str, int] = {}
        data_rows = 0
        for row in range(header_row + 1, (chosen.max_row or header_row) + 1):
            key = _item_id_key(chosen.cell(row, item_id_col).value)
            if key is None:
                continue
            data_rows += 1
            if key in seen:
                raise WorkbookError(
                    f"Duplicate Item_Id {key!r} at rows {seen[key]} and {row}."
                )
            seen[key] = row

        headers = tuple(
            _norm_header(chosen.cell(header_row, col).value) or f"__empty_{col}"
            for col in range(1, (chosen.max_column or 1) + 1)
        )
        return WorkbookMeta(
            sheet_name=chosen.title,
            header_row=header_row,
            headers=headers,
            data_row_count=data_rows,
            column_count=chosen.max_column or 0,
        )
    finally:
        wb.close()


def iter_source_rows(path: Path) -> tuple[WorkbookMeta, list[SourceRow]]:
    """Read original combination rows. Does not rewrite the file."""
    meta = inspect_workbook(path)
    wb = _open_xlsx(path)
    try:
        ws = wb[meta.sheet_name]
        cols = _header_map(ws, meta.header_row)
        item_id_col = cols["Item_Id"]
        rows: list[SourceRow] = []
        for row in range(meta.header_row + 1, (ws.max_row or meta.header_row) + 1):
            item_id = ws.cell(row, item_id_col).value
            if _item_id_key(item_id) is None:
                continue
            rows.append(
                SourceRow(
                    row_index=row,
                    item_id=item_id,
                    barcode=ws.cell(row, cols["Barcode"]).value if "Barcode" in cols else None,
                    item_name=ws.cell(row, cols["Item Name"]).value if "Item Name" in cols else None,
                    hsn=ws.cell(row, cols["HsnCode"]).value if "HsnCode" in cols else None,
                    brand=ws.cell(row, cols["Brand"]).value if "Brand" in cols else None,
                    size=ws.cell(row, cols["Size"]).value if "Size" in cols else None,
                    mrp=ws.cell(row, cols["MRP"]).value if "MRP" in cols else None,
                    rate=ws.cell(row, cols["Rate"]).value if "Rate" in cols else None,
                    purchase_price=(
                        ws.cell(row, cols["Purchase Price"]).value
                        if "Purchase Price" in cols else None
                    ),
                    expiry=(
                        ws.cell(row, cols["Expiry Date"]).value
                        if "Expiry Date" in cols else None
                    ),
                    stock=(
                        ws.cell(row, cols["System Stock"]).value
                        if "System Stock" in cols else None
                    ),
                )
            )
        return meta, rows
    finally:
        wb.close()


def copy_workbook(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)


def validate_identity_copy(source: Path, output: Path) -> None:
    """Compare source vs output. Mutable columns may differ; everything else must not."""
    src_wb = _open_xlsx(source)
    out_wb = _open_xlsx(output)
    try:
        if src_wb.sheetnames != out_wb.sheetnames:
            raise WorkbookValidationError(
                f"Sheet names differ: {src_wb.sheetnames!r} vs {out_wb.sheetnames!r}."
            )

        for sheet_name in src_wb.sheetnames:
            src_ws = src_wb[sheet_name]
            out_ws = out_wb[sheet_name]
            if src_ws.max_row != out_ws.max_row:
                raise WorkbookValidationError(
                    f"Sheet {sheet_name!r} row count differs: "
                    f"{src_ws.max_row} vs {out_ws.max_row}."
                )
            if src_ws.max_column != out_ws.max_column:
                raise WorkbookValidationError(
                    f"Sheet {sheet_name!r} column count differs: "
                    f"{src_ws.max_column} vs {out_ws.max_column}."
                )

            header_row = _find_header_row(src_ws) or 1
            src_headers = _header_map(src_ws, header_row)
            out_headers = _header_map(out_ws, header_row)
            if src_headers != out_headers:
                raise WorkbookValidationError(
                    f"Sheet {sheet_name!r} headers/order differ."
                )

            col_names = {
                col: _norm_header(src_ws.cell(header_row, col).value)
                for col in range(1, (src_ws.max_column or 1) + 1)
            }

            max_row = src_ws.max_row or 1
            max_col = src_ws.max_column or 1
            for row in range(1, max_row + 1):
                for col in range(1, max_col + 1):
                    if row > header_row and col_names.get(col) in MUTABLE_COLUMNS:
                        continue
                    left = src_ws.cell(row, col).value
                    right = out_ws.cell(row, col).value
                    if left != right:
                        header = col_names.get(col) or f"column {col}"
                        raise WorkbookValidationError(
                            f"Protected cell changed on sheet {sheet_name!r} "
                            f"row {row} ({header}): {left!r} vs {right!r}."
                        )
    finally:
        src_wb.close()
        out_wb.close()


def export_identity_copy(source: Path, dest: Path) -> None:
    """Copy source to dest, then validate. Deletes dest and raises on failure."""
    copy_workbook(source, dest)
    try:
        validate_identity_copy(source, dest)
    except WorkbookValidationError:
        if dest.exists():
            dest.unlink()
        raise


def export_approved_proposals(
    source: Path, dest: Path, proposals_by_item_id: dict[str, dict[str, object]],
) -> None:
    """Copy source, apply allowed values by Item_Id, then validate all invariants."""
    copy_workbook(source, dest)
    try:
        meta = inspect_workbook(source)
        wb = _open_xlsx(dest)
        try:
            ws = wb[meta.sheet_name]
            cols = _header_map(ws, meta.header_row)
            item_col = cols["Item_Id"]
            remaining = dict(proposals_by_item_id)
            for row_number in range(meta.header_row + 1, (ws.max_row or meta.header_row) + 1):
                item_id = _item_id_key(ws.cell(row_number, item_col).value)
                changes = remaining.pop(item_id, None) if item_id else None
                if not changes:
                    continue
                for column, value in changes.items():
                    if column not in {"Item Name", "Brand", "Size"}:
                        raise WorkbookValidationError(f"Column {column!r} is not exportable.")
                    ws.cell(row_number, cols[column]).value = value
            if remaining:
                raise WorkbookValidationError("Approved proposal Item_Id was not found in source workbook.")
            wb.save(dest)
        finally:
            wb.close()
        validate_identity_copy(source, dest)
    except Exception:
        if dest.exists():
            dest.unlink()
        raise

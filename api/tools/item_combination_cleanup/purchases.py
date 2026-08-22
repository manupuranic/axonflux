"""Purchase-history matcher. Source of truth: raw.raw_purchase_itemwise only."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.engine import Connection


def barcode_key(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return format(value, "f").rstrip("0").rstrip(".")
    text_value = str(value).strip()
    return text_value or None


def mrp_key(value: object | None) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return None


def parse_purchase_date(raw: object | None) -> date | None:
    if raw is None:
        return None
    text_value = str(raw).strip()
    if not text_value:
        return None
    text_value = text_value.replace("/", "-")
    for fmt in ("%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text_value[:10], fmt).date()
        except ValueError:
            continue
    return None


def is_dummy_supplier(supplier: str) -> bool:
    """The migration placeholder is exact ABC after whitespace/case normalization."""
    return supplier.strip().upper() == "ABC"


def _identity_key(value: object | None) -> str:
    """Exact format normalization, deliberately not fuzzy matching."""
    return re.sub(r"[^A-Z0-9]+", "", str(value or "").upper())


def barcode_identity_is_safe(
    *,
    purchase_names: Iterable[object | None],
    purchase_sizes: Iterable[object | None],
    item_names: Iterable[object | None],
    item_sizes: Iterable[object | None],
) -> bool:
    """Return false only for material, exact textual identity disagreement."""
    groups = (purchase_names, purchase_sizes, item_names, item_sizes)
    return all(
        len({_identity_key(value) for value in values if _identity_key(value)}) <= 1
        for values in groups
    )


@dataclass(frozen=True)
class PurchaseHit:
    supplier_name: str
    purchase_date: date
    purchase_id: str | None
    invoice_no: str | None
    source_file_name: str | None
    match_method: str
    supplier_count: int


class PurchaseIndex:
    def __init__(self) -> None:
        self._by_bm: dict[tuple[str, Decimal], PurchaseHit] = {}
        self._by_bc: dict[str, PurchaseHit] = {}
        self._supplier_counts: dict[str, int] = {}
        self._bm_dates: dict[tuple[str, Decimal], date] = {}
        self._bc_dates: dict[str, date] = {}
        self._suppliers: dict[str, set[str]] = {}
        self._purchase_names: dict[str, set[str]] = {}
        self._purchase_sizes: dict[str, set[str]] = {}

    def add(
        self,
        *,
        barcode: str,
        mrp: Decimal | None,
        supplier: str,
        purchase_date: date,
        purchase_id: str | None,
        invoice_no: str | None,
        source_file: str | None,
        item_name: str | None = None,
        size: str | None = None,
    ) -> None:
        if item_name and item_name.strip():
            self._purchase_names.setdefault(barcode, set()).add(item_name.strip())
        if size and size.strip():
            self._purchase_sizes.setdefault(barcode, set()).add(size.strip())
        if is_dummy_supplier(supplier):
            return
        self._suppliers.setdefault(barcode, set()).add(supplier)
        if mrp is not None:
            key = (barcode, mrp)
            prev = self._bm_dates.get(key)
            if prev is None or purchase_date >= prev:
                self._bm_dates[key] = purchase_date
                self._by_bm[key] = PurchaseHit(
                    supplier_name=supplier,
                    purchase_date=purchase_date,
                    purchase_id=purchase_id,
                    invoice_no=invoice_no,
                    source_file_name=source_file,
                    match_method="barcode_mrp",
                    supplier_count=0,
                )
        prev_bc = self._bc_dates.get(barcode)
        if prev_bc is None or purchase_date >= prev_bc:
            self._bc_dates[barcode] = purchase_date
            self._by_bc[barcode] = PurchaseHit(
                supplier_name=supplier,
                purchase_date=purchase_date,
                purchase_id=purchase_id,
                invoice_no=invoice_no,
                source_file_name=source_file,
                match_method="barcode",
                supplier_count=0,
            )

    def finalize(self) -> None:
        self._supplier_counts = {bc: len(names) for bc, names in self._suppliers.items()}

    def lookup(self, barcode: str | None, mrp: Decimal | None) -> PurchaseHit | None:
        if not barcode:
            return None
        nsup = self._supplier_counts.get(barcode, 0)
        if mrp is not None:
            hit = self._by_bm.get((barcode, mrp))
            if hit is not None:
                return PurchaseHit(
                    supplier_name=hit.supplier_name,
                    purchase_date=hit.purchase_date,
                    purchase_id=hit.purchase_id,
                    invoice_no=hit.invoice_no,
                    source_file_name=hit.source_file_name,
                    match_method="barcode_mrp",
                    supplier_count=nsup,
                )
        hit = self._by_bc.get(barcode)
        if hit is None:
            return None
        return PurchaseHit(
            supplier_name=hit.supplier_name,
            purchase_date=hit.purchase_date,
            purchase_id=hit.purchase_id,
            invoice_no=hit.invoice_no,
            source_file_name=hit.source_file_name,
            match_method="barcode",
            supplier_count=nsup,
        )

    def identity_is_safe(
        self,
        barcode: str | None,
        *,
        item_names: Iterable[object | None],
        item_sizes: Iterable[object | None],
    ) -> bool:
        if not barcode:
            return False
        return barcode_identity_is_safe(
            purchase_names=self._purchase_names.get(barcode, ()),
            purchase_sizes=self._purchase_sizes.get(barcode, ()),
            item_names=item_names,
            item_sizes=item_sizes,
        )


def load_purchase_index(conn: Connection) -> PurchaseIndex:
    index = PurchaseIndex()
    rows = conn.execute(text("""
        SELECT barcode, mrp, supplier_name_raw, purchase_date_raw, item_name_raw, size_raw,
               purchase_id, invoice_no, source_file_name
        FROM raw.raw_purchase_itemwise
    """)).mappings()
    for row in rows:
        bc = barcode_key(row["barcode"])
        if not bc:
            continue
        supplier = (row["supplier_name_raw"] or "").strip()
        if not supplier:
            continue
        parsed = parse_purchase_date(row["purchase_date_raw"])
        if parsed is None:
            continue
        pid = row["purchase_id"]
        inv = row["invoice_no"]
        src = row["source_file_name"]
        index.add(
            barcode=bc,
            mrp=mrp_key(row["mrp"]),
            supplier=supplier,
            purchase_date=parsed,
            purchase_id=None if pid is None else str(pid),
            invoice_no=None if inv is None else str(inv),
            source_file=None if src is None else str(src),
            item_name=None if row["item_name_raw"] is None else str(row["item_name_raw"]),
            size=None if row["size_raw"] is None else str(row["size_raw"]),
        )
    index.finalize()
    return index

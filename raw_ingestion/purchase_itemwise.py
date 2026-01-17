from pathlib import Path
import pandas as pd

from raw_ingestion.common.ingest_core import ingest_raw_table
from raw_models.purchases import RawPurchaseItemwise

HEADER_MAP = {
    "Purchase Id": "purchase_id",
    "Purchase Reference Id": "purchase_reference_id",
    "Invoice No": "invoice_no",
    "Pur.Date": "purchase_date_raw",
    "Supplier": "supplier_name_raw",
    "Barcode": "barcode",
    "Item Name": "item_name_raw",
    "HSN Code": "hsn_code",
    "Tax Type": "tax_type",
    "GST (%)": "gst_percent",
    "Min Stock": "min_stock",
    "Max Stock": "max_stock",
    "Expiry Date": "expiry_date_raw",
    "Brand": "brand_raw",
    "QTY - PHM": "qty_phm",
    "Free Qty- PHM": "free_qty_phm",
    "QTY - WH": "qty_wh",
    "Free Qty- WH": "free_qty_wh",
    "Total Qty": "total_qty",
    "Profit(%)": "profit_percent",
    "Taxable Value": "taxable_value",
    "MRP": "mrp",
    "Rate": "rate",
}

def ingest(file_path: str):
    ingest_raw_table(
        file_path=Path(file_path),
        model=RawPurchaseItemwise,
        header_map=HEADER_MAP,
        reader=pd.read_csv,
        drop_last_row=True,
    )

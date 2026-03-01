from pathlib import Path
import pandas as pd

from raw_ingestion.common.ingest_core import ingest_raw_table
from raw_models.purchases import RawPurchaseBillwise

HEADER_MAP = {
    "Location": "location_name",
    "Age": "age",
    "ID": "purchase_id",
    "Ref. ID": "ref_id",
    "Invoice": "invoice_no",
    "Date": "purchase_date_raw",
    "Time": "purchase_time_raw",
    "Supplier": "supplier_name_raw",
    "Supplier Type": "supplier_type",
    "Status": "status",
    "Total Qty": "total_qty",
    "Total Disc1(Rs)": "total_disc1_amount",
    "Extra Disc": "extra_disc_amount",
    "Taxable Value": "taxable_value",
    "GST-0": "gst_0",
    "GST-3": "gst_3",
    "GST-5": "gst_5",
    "GST-12": "gst_12",
    "GST-18": "gst_18",
    "GST-28": "gst_28",
    "GST-40": "gst_40",
    "Total Tax": "tax_amount",
    "Round Off": "round_off",
    "Settled Amount": "settled_amount",
    "Due Amount": "due_amount",
}


REQUIRED_COLUMNS = [
    "ID",
    "Date",
    "Supplier",
    "Total Qty",
]


def ingest(file_path: str):
    ingest_raw_table(
        file_path=Path(file_path),
        model=RawPurchaseBillwise,
        header_map=HEADER_MAP,
        reader=pd.read_csv,
        required_columns=REQUIRED_COLUMNS,
        file_label="purchase bill-wise",
        drop_last_row=True,
    )

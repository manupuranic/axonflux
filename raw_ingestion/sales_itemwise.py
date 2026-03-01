from pathlib import Path
import pandas as pd

from raw_ingestion.common.ingest_core import ingest_raw_table
from raw_models.sales import RawSalesItemwise

HEADER_MAP = {
    # Context
    "Store Name": "store_name",
    "Sale Location": "sale_location",
    "Operator": "operator_name",

    # Bill
    "Bill No.": "bill_no",
    "Date": "sale_datetime_raw",
    "Sale To": "sale_to",
    "Customer": "customer_name",
    "Mobile No": "mobile",
    "GSTIN No": "gstin",

    # Item identity
    "Item Name": "item_name_raw",
    "Barcode": "barcode",
    "HSN Code": "hsn_code",
    "Brand": "brand_raw",
    "Size": "size_raw",
    "Colour": "colour_raw",
    "Style": "style_raw",
    "Expiry Date": "expiry_date_raw",

    # Quantity
    "Qty": "sale_qty",
    "Free Qty": "free_qty",
    "Cur Stk": "current_stock_snapshot",

    # Pricing
    "MRP": "mrp",
    "Total MRP": "total_mrp",
    "Rate": "rate",
    "Total Rate": "total_rate",
    "Disc1(%)": "discount_percent",
    "Disc1(Rs)": "discount_amount",
    "Other Discount(Rs)": "other_discount_amount",
    "Total Discount(Rs)": "total_discount_amount",
    "Taxable Amt.": "taxable_amount",

    # Tax
    "IGST(%)": "igst_percent",
    "IGST(Rs)": "igst_amount",
    "CGST(%)": "cgst_percent",
    "CGST(Rs)": "cgst_amount",
    "SGST(%)": "sgst_percent",
    "SGST(Rs)": "sgst_amount",
    "CESS(%)": "cess_percent",
    "CESS(Rs)": "cess_amount",

    # Totals
    "Gross Amount": "gross_amount",
    "Round Off": "round_off",
    "Net Total": "net_total",
}


REQUIRED_COLUMNS = [
    "Item Name",
    "Barcode",
    "Qty",
    "Net Total",
]


def reader(path):
    if path.suffix.lower() in [".xlsx", ".xls"]:
        return pd.read_excel(path, skiprows=2, header=0)
    elif path.suffix.lower() == ".csv":
        return pd.read_csv(path)
    else:
        raise ValueError("Unsupported file type")


def ingest(file_path: str):
    ingest_raw_table(
        file_path=Path(file_path),
        model=RawSalesItemwise,
        header_map=HEADER_MAP,
        reader=reader,
        required_columns=REQUIRED_COLUMNS,
        file_label="sales item-wise",
        drop_last_row=False,  # itemwise has no totals row
    )



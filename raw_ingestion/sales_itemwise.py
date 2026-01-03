import uuid
import pandas as pd
from pathlib import Path
from sqlalchemy import insert

from db.db import DB
from raw_models.sales import RawSalesItemwise

def clean(value):
    return None if pd.isna(value) else value

def ingest_sales_itemwise(file_path: str):
    """
    Ingest a single item-wise sales report into raw.raw_sales_itemwise
    """
    
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"{file_path} does not exist")

    print(f"[INGEST] Processing {file_path.name}")

    # 1. Create batch id
    import_batch_id = uuid.uuid4()

    # 2. Load file
    if file_path.suffix.lower() in [".xlsx", ".xls"]:
        df = pd.read_excel(file_path, skiprows=2, header=0)
    elif file_path.suffix.lower() == ".csv":
        df = pd.read_csv(file_path)
    else:
        raise ValueError("Unsupported file type")

    # 3. Basic sanity check
    if df.empty:
        print("[INGEST] File is empty, skipping")
        return

    # 4. Normalize column names (minimal, no logic)
    df.columns = [col.strip() for col in df.columns]

    # 5. Prepare rows
    rows = []

    for _, row in df.iterrows():
        record = {
            "import_batch_id": clean(import_batch_id),
            "source_file_name": clean(file_path.name),

            # Context
            "store_name": clean(row.get("Store Name")),
            "sale_location": clean(row.get("Sale Location")),
            "operator_name": clean(row.get("Operator")),

            # Bill
            "bill_no": clean(row.get("Bill No.")),
            "sale_datetime_raw": clean(row.get("Date")),
            "sale_to": clean(row.get("Sale To")),
            "customer_name": clean(row.get("Customer")),
            "mobile": clean(row.get("Mobile No")),
            "gstin": clean(row.get("GSTIN No")),

            # Item identity
            "item_name_raw": clean(row.get("Item Name")),
            "barcode": clean(row.get("Barcode")),
            "hsn_code": clean(row.get("HSN Code")),
            "brand_raw": clean(row.get("Brand")),
            "size_raw": clean(row.get("Size")),
            "colour_raw": clean(row.get("Colour")),
            "style_raw": clean(row.get("Style")),
            "expiry_date_raw": clean(row.get("Expiry Date")),

            # Quantity
            "sale_qty": clean(row.get("Qty")),
            "free_qty": clean(row.get("Free Qty")),
            "current_stock_snapshot": clean(row.get("Cur Stk")),

            # Pricing
            "mrp": clean(row.get("MRP")),
            "total_mrp": clean(row.get("Total MRP")),
            "rate": clean(row.get("Rate")),
            "total_rate": clean(row.get("Total Rate")),
            "discount_percent": clean(row.get("Disc1(%)")),
            "discount_amount": clean(row.get("Disc1(Rs)")),
            "other_discount_amount": clean(row.get("Other Discount(Rs)")),
            "total_discount_amount": clean(row.get("Total Discount(Rs)")),
            "taxable_amount": clean(row.get("Taxable Amt.")),

            "igst_percent": clean(row.get("IGST(%)")),
            "igst_amount": clean(row.get("IGST(Rs)")),
            "cgst_percent": clean(row.get("CGST(%)")),
            "cgst_amount": clean(row.get("CGST(Rs)")),
            "sgst_percent": clean(row.get("SGST(%)")),
            "sgst_amount": clean(row.get("SGST(Rs)")),
            "cess_percent": clean(row.get("CESS(%)")),
            "cess_amount": clean(row.get("CESS(Rs)")),

            "gross_amount": clean(row.get("Gross Amount")),
            "round_off": clean(row.get("Round Off")),
            "net_total": clean(row.get("Net Total")),
        }

        rows.append(record)

    if not rows:
        print("[INGEST] No valid rows found")
        return

    # 6. Insert into DB (single transaction)
    db = DB()
    with db.session() as session:
        session.execute(
            insert(RawSalesItemwise),
            rows
        )

    print(f"[INGEST] Inserted {len(rows)} rows (batch {import_batch_id})")
    



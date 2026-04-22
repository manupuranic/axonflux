import uuid
from sqlalchemy import insert

from db.db import DB
from raw_models.sales import RawSalesItemwise

def main():
    db = DB()

    test_row = {
        "import_batch_id": uuid.uuid4(),
        "source_file_name": "test_sales_itemwise.xlsx",

        "store_name": "Test Supermarket",
        "sale_location": "Main Store",
        "operator_name": "Test Operator",

        "bill_no": "TEST-BILL-001",
        "sale_datetime_raw": "2026-01-03 18:45",

        "item_name_raw": "Jowar 1kg",
        "barcode": "TEST-BARCODE-123",
        "hsn_code": "1001",
        "brand_raw": "Test Brand",
        "size_raw": "1kg",

        "sale_qty": 2,
        "free_qty": 0,
        "current_stock_snapshot": 48,

        "mrp": 80,
        "rate": 75,
        "gross_amount": 150,
        "discount_amount": 0,
        "taxable_amount": 150,
        "non_taxable_amount": 0,
        "cgst_amount": 3.75,
        "sgst_amount": 3.75,
        "igst_amount": 0,
        "cess_amount": 0,
        "round_off": 0,
        "net_total": 157.5,
    }

    with db.session() as session:
        session.execute(
            insert(RawSalesItemwise),
            [test_row]
        )

    print("✅ Test insert into raw_sales_itemwise successful")

if __name__ == "__main__":
    main()

from pathlib import Path
import pandas as pd

from raw_ingestion.common.ingest_core import ingest_raw_table
from raw_models.items import RawItemCombinations

HEADER_MAP = {
    "Item_Id": "item_id_raw",
    "Barcode": "barcode",
    "Item Name": "item_name_raw",
    "HsnCode": "hsn_code",
    "Tax Category": "tax_category_raw",
    "Brand": "brand_raw",
    "Size": "size_raw",
    "Colour": "colour_raw",
    "Style": "style_raw",
    "Expiry Date": "expiry_date_raw",
    "Purchase Price": "purchase_price",
    "MRP": "mrp",
    "Rate": "rate",
    "System Stock": "system_stock_snapshot",
}


REQUIRED_COLUMNS = [
    "Item_Id",
    "Barcode",
    "Item Name",
    "MRP",
]
    
def ingest(file_path: str):
    ingest_raw_table(
        file_path=Path(file_path),
        model=RawItemCombinations,
        header_map=HEADER_MAP,
        reader=pd.read_excel,
        required_columns=REQUIRED_COLUMNS,
        file_label="item combinations",
        drop_last_row=False,
    )

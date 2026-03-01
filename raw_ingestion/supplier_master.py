from pathlib import Path
import pandas as pd

from raw_ingestion.common.ingest_core import ingest_raw_table
from raw_models.suppliers import RawSupplierMaster

HEADER_MAP = {
    "Id": "supplier_id_raw",
    "Status": "status_raw",
    "Supplier Code": "supplier_code_raw",
    "Supplier Name": "supplier_name_raw",
    "Location": "location_raw",
    "Address": "address_raw",
    "Mobile": "mobile_raw",
    "Email": "email_raw",
    "Supplier Date": "supplier_date_raw",
    "city": "city_raw",
    "Country": "country_raw",
    "State": "state_raw",
    "Register Type": "register_type_raw",
    "GSTIN / UID": "gstin_raw",
    "Tin No": "tin_no_raw",
    "Pan No": "pan_no_raw",
    "Registered Invoice Start Duration": "registered_invoice_start_duration_raw",
    "Supplier Category": "supplier_category_raw",
    "Create Ledger": "create_ledger_raw",
    "Closing Balance": "closing_balance_raw",
}


REQUIRED_COLUMNS = [
    "Supplier Code",
    "Supplier Name",
    "Mobile",
]
    
def ingest(file_path: str | Path) -> None:
    ingest_raw_table(
        file_path=Path(file_path),
        model=RawSupplierMaster,
        header_map=HEADER_MAP,
        reader=pd.read_csv,
        required_columns=REQUIRED_COLUMNS,
        file_label="supplier master",
        drop_last_row=False,
    )

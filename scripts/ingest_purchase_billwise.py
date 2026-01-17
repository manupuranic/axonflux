import sys
from raw_ingestion.purchase_billwise import ingest

if __name__ == "__main__":
    # if len(sys.argv) < 2:
    #     raise ValueError("Usage: python -m scripts.ingest_sales_itemwise <file_path>")

    # ingest_sales_itemwise(sys.argv[1])
    ingest('data/samples/bill-wise-purchase-report.csv')

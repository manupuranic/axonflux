import sys
from raw_ingestion.sales_billwise import ingest_sales_billwise

if __name__ == "__main__":
    # if len(sys.argv) < 2:
    #     raise ValueError("Usage: python -m scripts.ingest_sales_itemwise <file_path>")

    # ingest_sales_itemwise(sys.argv[1])
    ingest_sales_billwise('data/samples/bill-wise-report.csv')

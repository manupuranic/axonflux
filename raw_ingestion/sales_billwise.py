from pathlib import Path
import pandas as pd

from raw_ingestion.common.ingest_core import ingest_raw_table
from raw_models.sales import RawSalesBillwise

COLUMN_MAP = {
    "Location": "location_name",
    "Sale Type": "sale_type",
    "Bill Type": "bill_type",
    "Sale ID": "sale_id",
    "Bill No.": "bill_no",
    "Operator": "operator_name",
    "Date": "bill_datetime_raw",

    "Dispatch Mode": "dispatch_mode",
    "GST Type": "gst_type",
    "Sale To": "sale_to",

    "Cust. Name": "customer_name_raw",
    "Cust. Mobile": "customer_mobile_raw",
    "Cust. Address": "customer_address_raw",
    "Cust. City": "customer_city_raw",
    "Cust. State": "customer_state_raw",
    "Company Name": "company_name",
    "GSTIN No.": "customer_gstin_raw",

    "Qty": "total_qty",
    "Total MRP": "total_mrp",
    "Total Rate": "total_rate",
    "Gross Sale": "gross_sale",

    "Cust Disc %": "cust_discount_percent",
    "Cust Discount": "cust_discount",
    "Bill Discount %": "bill_discount_percent",
    "Bill Discount": "bill_discount_amount",
    "Extra Discount %": "extra_discount_percent",
    "Extra Discount": "extra_discount_amount",
    "Membercard Disc.": "membercard_discount",
    "Total Discount": "total_discount",

    "Taxable Amt.": "taxable_amount",

    "GST-0": "taxable_amt_0",
    "GST-3": "taxable_amt_3",
    "GST-5": "taxable_amt_5",
    "GST-12": "taxable_amt_12",
    "GST-18": "taxable_amt_18",
    "GST-28": "taxable_amt_28",
    "GST-40": "taxable_amt_40",

    "taxable Amt0  %": "taxable_amt_0_percent",
    "taxable Amt3  %": "taxable_amt_3_percent",
    "taxable Amt5  %": "taxable_amt_5_percent",
    "taxable Amt12  %": "taxable_amt_12_percent",
    "taxable Amt18  %": "taxable_amt_18_percent",
    "taxable Amt28  %": "taxable_amt_28_percent",
    "taxable Amt40  %": "taxable_amt_40_percent",

    "IGST 3 %": "igst_3",
    "IGST 5 %": "igst_5",
    "IGST 12 %": "igst_12",
    "IGST 18 %": "igst_18",
    "IGST 28 %": "igst_28",
    "IGST 40 %": "igst_40",

    "CGST 1.5 %": "cgst_1_5",
    "CGST 2.5 %": "cgst_2_5",
    "CGST 6 %": "cgst_6",
    "CGST 9 %": "cgst_9",
    "CGST 14 %": "cgst_14",
    "CGST 20 %": "cgst_20",

    "SGST 1.5 %": "sgst_1_5",
    "SGST 2.5 %": "sgst_2_5",
    "SGST 6 %": "sgst_6",
    "SGST 9 %": "sgst_9",
    "SGST 14 %": "sgst_14",
    "SGST 20 %": "sgst_20",

    "Total IGST": "total_igst",
    "Total CGST": "total_cgst",
    "Total SGST": "total_sgst",
    "Net Tax": "net_tax",

    "Other Charges": "other_charges",
    "Credit Amt": "credit_amount",
    "CN Adjust": "cn_adjust",
    "CN Amount": "cn_amount",
    "Cash": "cash_amount",
    "Card": "card_amount",
    "Google Pay": "google_pay_amount",
    "Phone Pe": "phonepe_amount",
    "Paytm": "paytm_amount",
    "Actual Cash": "actual_cash",
    "Cash Return": "cash_return",

    "Round Off": "round_off",
    "Net Total": "net_total"
}


REQUIRED_COLUMNS = [
    "Bill No.",
    "Date",
    "Qty",
    "Net Total",
]


def ingest(file_path: str):
    ingest_raw_table(
        file_path=Path(file_path),
        model=RawSalesBillwise,
        header_map=COLUMN_MAP,
        reader=pd.read_csv,
        required_columns=REQUIRED_COLUMNS,
        file_label="sales bill-wise",
        drop_last_row=True,
    )

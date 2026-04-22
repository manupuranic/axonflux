"""
Generate synthetic FMCG supermarket data for demo purposes.

Produces 6 months of realistic sales and purchase CSVs in data/sample/.
Replicates real-world data quality issues: duplicate barcodes, name typo
variants, mixed casing -- making Phase B3 (entity resolution) demonstrable.

Usage:
    python scripts/generate_demo_data.py
    python scripts/generate_demo_data.py --start 2025-10-01 --end 2026-03-31
"""

import argparse
import random
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

random.seed(42)
np.random.seed(42)

OUT_DIR = Path("data/sample")

# ── Product catalog ───────────────────────────────────────────────────────────
# (name, barcode, hsn, brand, mrp, gst_pct, supplier_code, velocity)
PRODUCTS = [
    # Staples
    ("AASHIRVAAD ATTA 5KG",       "8901030460001", "1101", "AASHIRVAAD",  350.0,  5, "SUP-001", "fast"),
    ("AASHIRVAAD ATTA 10KG",      "8901030460002", "1101", "AASHIRVAAD",  680.0,  5, "SUP-001", "normal"),
    ("TATA SALT 1KG",             "8901234000010", "2501", "TATA",         24.0,  0, "SUP-001", "fast"),
    ("FORTUNE SUNFLOWER OIL 1L",  "8901030460010", "1512", "FORTUNE",     175.0,  5, "SUP-001", "fast"),
    ("FORTUNE SUNFLOWER OIL 5L",  "8901030460011", "1512", "FORTUNE",     840.0,  5, "SUP-001", "normal"),
    ("INDIA GATE BASMATI 1KG",    "8901234000020", "1006", "INDIA GATE",  130.0,  5, "SUP-001", "normal"),
    ("SONA MASOORI RICE 5KG",     "8901234000021", "1006", "LOCAL",       250.0,  5, "SUP-001", "normal"),
    # Dairy
    ("AMUL BUTTER 500G",          "8901030460020", "0402", "AMUL",        280.0, 12, "SUP-003", "fast"),
    ("AMUL BUTTER 100G",          "8901030460021", "0402", "AMUL",         60.0, 12, "SUP-003", "normal"),
    ("AMUL CHEESE SLICE 200G",    "8901030460022", "0406", "AMUL",        120.0, 12, "SUP-003", "normal"),
    ("HERITAGE FRESH CURD 400G",  "8901234000030", "0403", "HERITAGE",     40.0,  5, "SUP-003", "fast"),
    # Snacks & Biscuits
    ("PARLE-G BISCUIT 799G",      "8901030460030", "1905", "PARLE",        50.0,  0, "SUP-002", "fast"),
    ("HIDE AND SEEK 100G",        "8901030460031", "1905", "PARLE",        35.0,  0, "SUP-002", "normal"),
    ("MARIE GOLD 250G",           "8901030460032", "1905", "BRITANNIA",    30.0,  0, "SUP-002", "normal"),
    ("MAGGI NOODLES 70G",         "8901030460040", "1902", "NESTLE",       14.0,  0, "SUP-004", "fast"),
    ("MAGGI NOODLES 4PK",         "8901030460041", "1902", "NESTLE",       56.0,  0, "SUP-004", "fast"),
    ("LAYS CLASSIC 26G",          "8901030460050", "2008", "PEPSICO",      20.0, 12, "SUP-002", "normal"),
    ("KURKURE MASALA 90G",        "8901030460051", "2008", "PEPSICO",      30.0, 12, "SUP-002", "normal"),
    # Beverages
    ("7UP 250ML",                 "8901030460060", "2202", "PEPSICO",      20.0, 28, "SUP-002", "normal"),
    ("PEPSI 600ML",               "8901030460061", "2202", "PEPSICO",      40.0, 28, "SUP-002", "normal"),
    ("SPRITE 750ML",              "8901030460062", "2202", "COCA-COLA",    45.0, 28, "SUP-002", "normal"),
    ("FROOTI 200ML",              "8901030460070", "2202", "PARLE AGRO",   20.0, 12, "SUP-002", "slow"),
    ("MAAZA 600ML",               "8901030460071", "2202", "COCA-COLA",    45.0, 12, "SUP-002", "slow"),
    ("BISLERI 1L",                "8901030460080", "2201", "BISLERI",      20.0,  0, "SUP-002", "fast"),
    # Personal Care
    ("COLGATE TOOTHPASTE 200G",   "8901030460090", "3306", "COLGATE",     120.0, 18, "SUP-005", "normal"),
    ("PEPSODENT 200G",            "8901030460091", "3306", "HUL",         100.0, 18, "SUP-005", "slow"),
    ("DETTOL SOAP 125G",          "8901030460100", "3401", "DETTOL",       55.0, 18, "SUP-005", "normal"),
    ("LUX SOAP 100G",             "8901030460101", "3401", "HUL",          50.0, 18, "SUP-005", "normal"),
    ("SURF EXCEL 1KG",            "8901030460110", "3402", "HUL",         220.0, 18, "SUP-005", "normal"),
    ("ARIEL 1KG",                 "8901030460111", "3402", "PG",          230.0, 18, "SUP-005", "normal"),
    ("CLINIC PLUS SHAMPOO 340ML", "8901030460120", "3305", "HUL",         195.0, 18, "SUP-005", "slow"),
    ("HEAD SHOULDERS 340ML",      "8901030460121", "3305", "PG",          310.0, 18, "SUP-005", "slow"),
    # Household
    ("SCOTCH-BRITE SCRUB 1PC",    "8901030460130", "3924", "3M",           45.0, 18, "SUP-005", "slow"),
    ("LIZOL DISINFECT 500ML",     "8901030460131", "3402", "RECKITT",     145.0, 18, "SUP-005", "slow"),
    ("HIT COCKROACH 200ML",       "8901030460140", "3808", "GODREJ",       95.0, 18, "SUP-005", "slow"),
    ("MORTEIN COIL 10PC",         "8901030460141", "3808", "RECKITT",      35.0, 18, "SUP-005", "slow"),
    # Health & Ayurveda
    ("DABUR HONEY 500G",          "8901030460150", "0409", "DABUR",       225.0, 12, "SUP-005", "normal"),
    ("CHYAWANPRASH 500G",         "8901030460151", "2106", "DABUR",       270.0, 12, "SUP-005", "slow"),
    ("PATANJALI DANT KANTI 200G", "8901030460160", "3306", "PATANJALI",    90.0, 12, "SUP-005", "slow"),
    ("HIMALAYA NEEM FACE WASH",   "8901030460161", "3304", "HIMALAYA",    100.0, 18, "SUP-005", "slow"),
    # Dead stock
    ("GLUCON-D LIME 1KG",         "8901030460170", "2106", "HEINZ",       210.0, 18, "SUP-002", "dead"),
    ("BOOST 500G",                "8901030460171", "2106", "HUL",         245.0, 18, "SUP-002", "dead"),
    ("HORLICKS 500G",             "8901030460172", "2106", "GSK",         270.0, 18, "SUP-002", "dead"),
    # Short manual barcodes (mirrors real Er4u pattern for loose/local items)
    ("LOOSE GROUNDNUTS 100G",     "GN100",         "1202", "LOCAL",        15.0,  0, "SUP-001", "normal"),
    ("LOOSE POHA 500G",           "PH500",         "1104", "LOCAL",        28.0,  0, "SUP-001", "normal"),
]

# ── Data quality issues ───────────────────────────────────────────────────────
# Same product entered with two different barcodes (duplicate catalog entry)
BARCODE_DUPES = {
    "8901030460110": "8901030460110B",  # SURF EXCEL 1KG
    "8901030460030": "8901030460030B",  # PARLE-G BISCUIT
    "8901030460001": "8901030460001B",  # AASHIRVAAD ATTA 5KG
}

# Human typo variants for the same barcode (different staff typing the name)
NAME_VARIANTS = {
    "8901030460040": ["MAGGI NOODLES 70G", "MAGGIE NOODLES 70G", "MAGGI NOODELS 70G"],
    "8901030460020": ["AMUL BUTTER 500G", "Amul Butter 500 Gm", "AMUL BUTTER500G"],
    "8901030460090": ["COLGATE TOOTHPASTE 200G", "COLGATE TOOTHPASTE  200G", "Colgate Toothpaste 200g"],
    "8901030460111": ["ARIEL 1KG", "ARIEL 1 KG", "Ariel 1Kg"],
    "8901030460010": ["FORTUNE SUNFLOWER OIL 1L", "FORTUNE SUN OIL 1L", "fortune sunflower oil 1l"],
}

# ── Customers ─────────────────────────────────────────────────────────────────
REGULAR_CUSTOMERS = [
    (f"98765{str(i).zfill(5)}", f"Customer {i:03d}") for i in range(1, 201)
]
WALK_IN_NAMES = ["WALK-IN", "CASH", "RETAIL", "GENERAL", "CASH CUSTOMER"]
OPERATORS = ["ADMIN", "OPERATOR1", "OPERATOR2"]

VELOCITY_WEIGHTS = {"fast": 1.0, "normal": 0.4, "slow": 0.1, "dead": 0.01}

FESTIVAL_DATES = {
    date(2025, 10, 2),   # Gandhi Jayanti
    date(2025, 10, 24),  # Dussehra
    date(2025, 11, 1),   # Kannada Rajyotsava
    date(2025, 12, 25),  # Christmas
    date(2026, 1, 1),    # New Year
    date(2026, 1, 14),   # Pongal
    date(2026, 1, 26),   # Republic Day
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def fmt_sales_date(dt: date, hour: int, minute: int, ampm: str) -> str:
    """Replicates the Er4u quirky format: DD-MM-YYYYHH:MI AM (no space before time)."""
    return f"{dt.strftime('%d-%m-%Y')}{hour:02d}:{minute:02d} {ampm}"


def fmt_purchase_date(dt: date) -> str:
    return dt.strftime("%d-%m-%Y")


def pick_name(barcode: str, base_name: str) -> str:
    if barcode in NAME_VARIANTS:
        return random.choice(NAME_VARIANTS[barcode])
    return base_name


def pick_barcode(barcode: str) -> str:
    if barcode in BARCODE_DUPES and random.random() < 0.25:
        return BARCODE_DUPES[barcode]
    return barcode


def daily_bill_count(dt: date) -> int:
    base = 80
    if dt.weekday() >= 5:
        base = int(base * 1.3)
    if dt in FESTIVAL_DATES:
        base = int(base * 1.6)
    return max(30, int(np.random.poisson(base)))


# ── Core generator ────────────────────────────────────────────────────────────

def generate(start: date, end: date):
    itemwise_rows = []
    billwise_rows = []
    purchase_rows = []

    weights = np.array([VELOCITY_WEIGHTS[p[7]] for p in PRODUCTS])
    weights = weights / weights.sum()

    bill_seq = 1
    purchase_id = 1
    dates = [start + timedelta(days=i) for i in range((end - start).days + 1)]

    for dt in dates:
        n_bills = daily_bill_count(dt)

        for _ in range(n_bills):
            if random.random() < 0.6:
                cust_mobile, cust_name = "", random.choice(WALK_IN_NAMES)
            else:
                cust_mobile, cust_name = random.choice(REGULAR_CUSTOMERS)

            operator = random.choice(OPERATORS)

            # Random time during store hours (9 AM - 9 PM)
            raw_hour = random.randint(9, 20)
            minute = random.randint(0, 59)
            ampm = "AM" if raw_hour < 12 else "PM"
            disp_hour = raw_hour if raw_hour <= 12 else raw_hour - 12
            if disp_hour == 0:
                disp_hour = 12

            bill_str = f"BILL-{dt.strftime('%Y%m%d')}-{bill_seq:04d}"
            bill_seq += 1

            # Payment split
            roll = random.random()
            if roll < 0.55:
                cash_r, card_r, gpay_r = 1.0, 0.0, 0.0
            elif roll < 0.80:
                cash_r, card_r, gpay_r = 0.0, 0.0, 1.0
            else:
                cash_r, card_r, gpay_r = 0.0, 1.0, 0.0

            n_items = max(1, int(np.random.poisson(3)))
            n_items = min(n_items, len(PRODUCTS))
            chosen_idxs = np.random.choice(len(PRODUCTS), size=n_items, replace=False, p=weights)

            bill_net = 0.0
            bill_qty = 0

            for idx in chosen_idxs:
                pname, pbarcode, hsn, brand, mrp, gst_pct, _, _ = PRODUCTS[idx]
                qty = random.randint(1, 4)
                disc_pct = random.choice([0, 0, 0, 2, 5, 5])
                rate = round(mrp * (1 - disc_pct / 100), 2)
                total_mrp = round(mrp * qty, 2)
                total_rate = round(rate * qty, 2)
                disc_amount = round(total_mrp - total_rate, 2)

                taxable = round(total_rate / (1 + gst_pct / 100), 2) if gst_pct > 0 else total_rate
                half_gst = round(taxable * (gst_pct / 2) / 100, 2) if gst_pct > 0 else 0.0
                net_total = round(taxable + half_gst * 2, 2)

                actual_barcode = pick_barcode(pbarcode)
                actual_name = pick_name(pbarcode, pname)
                sale_dt_str = fmt_sales_date(dt, disp_hour, minute, ampm)

                itemwise_rows.append({
                    "Store Name":          "Demo Supermarket",
                    "Sale Location":       "Main Store",
                    "Operator":            operator,
                    "Bill No.":            bill_str,
                    "Date":                sale_dt_str,
                    "Sale To":             "RETAIL",
                    "Customer":            cust_name,
                    "Mobile No":           cust_mobile,
                    "GSTIN No":            "",
                    "Item Name":           actual_name,
                    "Barcode":             actual_barcode,
                    "HSN Code":            hsn,
                    "Brand":               brand,
                    "Size":                "",
                    "Colour":              "",
                    "Style":               "",
                    "Expiry Date":         "",
                    "Qty":                 qty,
                    "Free Qty":            0,
                    "Cur Stk":             random.randint(5, 200),
                    "MRP":                 mrp,
                    "Total MRP":           total_mrp,
                    "Rate":                rate,
                    "Total Rate":          total_rate,
                    "Disc1(%)":            disc_pct,
                    "Disc1(Rs)":           disc_amount,
                    "Other Discount(Rs)":  0,
                    "Total Discount(Rs)":  disc_amount,
                    "Taxable Amt.":        taxable,
                    "IGST(%)":             0,
                    "IGST(Rs)":            0,
                    "CGST(%)":             round(gst_pct / 2, 1),
                    "CGST(Rs)":            half_gst,
                    "SGST(%)":             round(gst_pct / 2, 1),
                    "SGST(Rs)":            half_gst,
                    "CESS(%)":             0,
                    "CESS(Rs)":            0,
                    "Gross Amount":        net_total,
                    "Round Off":           0,
                    "Net Total":           net_total,
                })

                bill_net += net_total
                bill_qty += qty

            bill_net = round(bill_net, 2)
            sale_dt_str = fmt_sales_date(dt, disp_hour, minute, ampm)

            billwise_rows.append({
                "Location":          "Main Store",
                "Sale Type":         "Retail",
                "Bill Type":         "Tax Invoice",
                "Sale ID":           len(billwise_rows) + 1,
                "Bill No.":          bill_str,
                "Operator":          operator,
                "Date":              sale_dt_str,
                "Dispatch Mode":     "Counter",
                "GST Type":          "CGST/SGST",
                "Sale To":           "RETAIL",
                "Cust. Name":        cust_name,
                "Cust. Mobile":      cust_mobile,
                "Cust. Address":     "",
                "Cust. City":        "Demo City",
                "Cust. State":       "Karnataka",
                "Company Name":      "",
                "GSTIN No.":         "",
                "Qty":               bill_qty,
                "Total MRP":         0,
                "Total Rate":        0,
                "Gross Sale":        bill_net,
                "Cust Disc %":       0, "Cust Discount":    0,
                "Bill Discount %":   0, "Bill Discount":    0,
                "Extra Discount %":  0, "Extra Discount":   0,
                "Membercard Disc.":  0,
                "Total Discount":    0,
                "Taxable Amt.":      0,
                "GST-0": 0, "GST-3": 0, "GST-5": 0, "GST-12": 0,
                "GST-18": 0, "GST-28": 0, "GST-40": 0,
                "taxable Amt0  %": 0,  "taxable Amt3  %": 0,
                "taxable Amt5  %": 0,  "taxable Amt12  %": 0,
                "taxable Amt18  %": 0, "taxable Amt28  %": 0,
                "taxable Amt40  %": 0,
                "IGST 3 %": 0, "IGST 5 %": 0, "IGST 12 %": 0,
                "IGST 18 %": 0, "IGST 28 %": 0, "IGST 40 %": 0,
                "CGST 1.5 %": 0, "CGST 2.5 %": 0, "CGST 6 %": 0,
                "CGST 9 %": 0,   "CGST 14 %": 0, "CGST 20 %": 0,
                "SGST 1.5 %": 0, "SGST 2.5 %": 0, "SGST 6 %": 0,
                "SGST 9 %": 0,   "SGST 14 %": 0, "SGST 20 %": 0,
                "Total IGST": 0, "Total CGST": 0, "Total SGST": 0,
                "Net Tax":       0,
                "Other Charges": 0,
                "Credit Amt":    0, "CN Adjust": 0, "CN Amount": 0,
                "Cash":          round(bill_net * cash_r, 2),
                "Card":          round(bill_net * card_r, 2),
                "Google Pay":    round(bill_net * gpay_r, 2),
                "Phone Pe":      0,
                "Paytm":         0,
                "Actual Cash":   round(bill_net * cash_r, 2),
                "Cash Return":   0,
                "Round Off":     0,
                "Net Total":     bill_net,
            })

        # Weekly restocks on Mondays
        if dt.weekday() == 0:
            for pname, pbarcode, _, _, mrp, gst_pct, sup_code, velocity in PRODUCTS:
                if velocity == "dead":
                    continue
                base_qty = {"fast": 100, "normal": 50, "slow": 20}[velocity]
                qty = int(np.random.poisson(base_qty))
                if qty == 0:
                    continue
                rate = round(mrp * 0.75, 2)
                taxable = round(rate * qty, 2)
                tax = round(taxable * gst_pct / 100, 2)

                purchase_rows.append({
                    "Location":        "Main Store",
                    "Age":             0,
                    "ID":              f"PO-{purchase_id:05d}",
                    "Ref. ID":         f"REF-{purchase_id:05d}",
                    "Invoice":         f"INV-{dt.strftime('%Y%m%d')}-{purchase_id:04d}",
                    "Date":            fmt_purchase_date(dt),
                    "Time":            "10:00:00",
                    "Supplier":        sup_code,
                    "Supplier Type":   "LOCAL",
                    "Status":          "SETTLED",
                    "Total Qty":       qty,
                    "Total Disc1(Rs)": 0,
                    "Extra Disc":      0,
                    "Taxable Value":   taxable,
                    "GST-0": 0, "GST-3": 0, "GST-5": 0, "GST-12": 0,
                    "GST-18": 0, "GST-28": 0, "GST-40": 0,
                    "Total Tax":       tax,
                    "Round Off":       0,
                    "Settled Amount":  round(taxable + tax, 2),
                    "Due Amount":      0,
                })
                purchase_id += 1

    return itemwise_rows, billwise_rows, purchase_rows


def write_csv(rows: list, path: Path, totals_row: bool = False):
    path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    if totals_row:
        totals = {col: "" for col in df.columns}
        totals[df.columns[0]] = "TOTAL"
        df = pd.concat([df, pd.DataFrame([totals])], ignore_index=True)
    df.to_csv(path, index=False)
    print(f"  Wrote {len(rows):,} rows -> {path}")


def parse_args():
    parser = argparse.ArgumentParser(description="Generate synthetic FMCG demo data.")
    parser.add_argument("--start", default="2025-10-01", help="Start date YYYY-MM-DD")
    parser.add_argument("--end",   default="2026-03-31", help="End date YYYY-MM-DD")
    return parser.parse_args()


def main():
    args = parse_args()
    start = date.fromisoformat(args.start)
    end   = date.fromisoformat(args.end)

    print(f"Generating demo data: {start} to {end}")
    itemwise, billwise, purchases = generate(start, end)

    print(f"\n  {len(itemwise):,} item rows  |  {len(billwise):,} bills  |  {len(purchases):,} purchase orders")
    print("\nWriting CSVs...")

    write_csv(itemwise,  OUT_DIR / "sales_itemwise"    / "sales_itemwise_demo.csv",    totals_row=False)
    write_csv(billwise,  OUT_DIR / "sales_billwise"    / "sales_billwise_demo.csv",    totals_row=True)
    write_csv(purchases, OUT_DIR / "purchase_billwise" / "purchase_billwise_demo.csv", totals_row=True)

    print("\nDone. To load into demo DB:")
    print("  cp -r data/sample/* data/incoming/")
    print("  PYTHONPATH=. python scripts/ingest_all.py")
    print("  PYTHONPATH=. python pipelines/weekly_pipeline.py")


if __name__ == "__main__":
    main()

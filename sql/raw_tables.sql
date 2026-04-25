CREATE SCHEMA IF NOT EXISTS raw;

CREATE TABLE raw.ingestion_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    report_type TEXT NOT NULL,

    row_count INTEGER,
    status TEXT NOT NULL DEFAULT 'SUCCESS',

    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (file_hash)
);


CREATE TABLE raw.raw_item_combinations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL,
  source_file_name text NOT NULL,
  imported_at timestamp DEFAULT now(),

  item_code text,
  item_name_raw text,
  barcode text,
  hsn_code text,
  brand_raw text,
  mrp numeric,
  expiry_date_raw text,
  size_raw text,

  item_id_raw text,
  tax_category_raw text,
  colour_raw text,
  style_raw text,

  purchase_price numeric,
  rate numeric,
  system_stock_snapshot numeric,

  CONSTRAINT raw_item_combinations_pkey PRIMARY KEY (id)
);

CREATE TABLE raw.raw_purchase_billwise (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL,
  source_file_name text NOT NULL,
  imported_at timestamp DEFAULT now(),

  purchase_date_raw text,
  supplier_name_raw text,
  tax_amount numeric,
  round_off numeric,
  location_name text,
  age numeric,

  purchase_id text,
  ref_id text,
  invoice_no text,
  purchase_time_raw text,
  supplier_type text,
  status text,

  total_qty numeric,
  total_disc1_amount numeric,
  extra_disc_amount numeric,
  taxable_value numeric,

  gst_0 numeric,
  gst_3 numeric,
  gst_5 numeric,
  gst_12 numeric,
  gst_18 numeric,
  gst_28 numeric,
  gst_40 numeric,

  settled_amount numeric,
  due_amount numeric,

  CONSTRAINT raw_purchase_billwise_pkey PRIMARY KEY (id)
);

CREATE TABLE raw.raw_purchase_itemwise (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL,
  source_file_name text NOT NULL,
  imported_at timestamp DEFAULT now(),

  purchase_date_raw text,
  supplier_name_raw text,
  item_name_raw text,
  barcode text,
  hsn_code text,
  brand_raw text,
  size_raw text,

  mrp numeric,
  taxable_amount numeric,

  purchase_id text,
  purchase_reference_id text,
  invoice_no text,

  tax_type text,
  gst_percent text,

  min_stock numeric,
  max_stock numeric,
  expiry_date_raw text,

  qty_phm numeric,
  free_qty_phm numeric,
  qty_wh numeric,
  free_qty_wh numeric,
  total_qty numeric,

  profit_percent numeric,
  taxable_value numeric,
  rate numeric,

  CONSTRAINT raw_purchase_itemwise_pkey PRIMARY KEY (id)
);

CREATE TABLE raw.raw_sales_billwise (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL,
  source_file_name text NOT NULL,
  imported_at timestamp DEFAULT now(),

  bill_no text,
  bill_datetime_raw text,
  operator_name text,
  location_name text,

  customer_name_raw text,
  customer_mobile_raw text,
  sale_to text,
  customer_gstin_raw text,

  round_off numeric,
  total_mrp numeric,
  total_rate numeric,
  taxable_amount numeric,

  sale_id text,
  sale_type text,
  bill_type text,
  gst_type text,
  dispatch_mode text,
  company_name text,

  customer_address_raw text,
  customer_city_raw text,
  customer_state_raw text,

  total_qty numeric,
  gross_sale numeric,

  cust_discount_percent numeric,
  cust_discount numeric,
  bill_discount_percent numeric,
  bill_discount_amount numeric,
  extra_discount_percent numeric,
  extra_discount_amount numeric,
  membercard_discount numeric,
  total_discount numeric,

  taxable_amt_0 numeric,
  taxable_amt_3 numeric,
  taxable_amt_5 numeric,
  taxable_amt_12 numeric,
  taxable_amt_18 numeric,
  taxable_amt_28 numeric,
  taxable_amt_40 numeric,

  taxable_amt_0_percent numeric,
  taxable_amt_3_percent numeric,
  taxable_amt_5_percent numeric,
  taxable_amt_12_percent numeric,
  taxable_amt_18_percent numeric,
  taxable_amt_28_percent numeric,
  taxable_amt_40_percent numeric,

  igst_3 numeric,
  igst_5 numeric,
  igst_12 numeric,
  igst_18 numeric,
  igst_28 numeric,
  igst_40 numeric,

  cgst_1_5 numeric,
  cgst_2_5 numeric,
  cgst_6 numeric,
  cgst_9 numeric,
  cgst_14 numeric,
  cgst_20 numeric,

  sgst_1_5 numeric,
  sgst_2_5 numeric,
  sgst_6 numeric,
  sgst_9 numeric,
  sgst_14 numeric,
  sgst_20 numeric,

  total_igst numeric,
  total_cgst numeric,
  total_sgst numeric,
  net_tax numeric,

  other_charges numeric,
  credit_amount numeric,
  cn_adjust numeric,
  cn_amount numeric,

  cash_amount numeric,
  card_amount numeric,
  google_pay_amount numeric,
  phonepe_amount numeric,
  paytm_amount numeric,
  actual_cash numeric,
  cash_return numeric,

  net_total numeric,

  CONSTRAINT raw_sales_billwise_pkey PRIMARY KEY (id)
);

CREATE TABLE raw.raw_sales_itemwise (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL,
  source_file_name text NOT NULL,
  imported_at timestamp DEFAULT now(),

  store_name text,
  sale_location text,
  operator_name text,

  bill_no text,
  sale_datetime_raw text,

  item_name_raw text,
  barcode text,
  hsn_code text,
  brand_raw text,
  size_raw text,
  colour_raw text,
  style_raw text,
  expiry_date_raw text,

  sale_qty numeric,
  free_qty numeric,
  current_stock_snapshot numeric,

  mrp numeric,
  rate numeric,
  gross_amount numeric,
  discount_amount numeric,
  taxable_amount numeric,
  round_off numeric,
  net_total numeric,

  sale_to text,
  customer_name text,
  mobile text,
  gstin text,

  total_mrp numeric,
  total_rate numeric,
  discount_percent numeric,
  other_discount_amount numeric,
  total_discount_amount numeric,

  igst_percent numeric,
  igst_amount numeric,
  cgst_percent numeric,
  cgst_amount numeric,
  sgst_percent numeric,
  sgst_amount numeric,
  cess_percent numeric,
  cess_amount numeric,

  CONSTRAINT raw_sales_itemwise_pkey PRIMARY KEY (id)
);

CREATE TABLE raw.raw_supplier_master (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL,
  source_file_name text NOT NULL,
  imported_at timestamp DEFAULT now(),

  supplier_name_raw text,
  gstin_raw text,
  address_raw text,

  supplier_id_raw text,
  status_raw text,
  supplier_code_raw text,
  location_raw text,
  mobile_raw text,
  email_raw text,
  supplier_date_raw text,

  city_raw text,
  country_raw text,
  state_raw text,
  register_type_raw text,
  tin_no_raw text,
  pan_no_raw text,

  registered_invoice_start_duration_raw text,
  supplier_category_raw text,
  create_ledger_raw text,
  closing_balance_raw text,

  CONSTRAINT raw_supplier_master_pkey PRIMARY KEY (id)
);

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'raw';


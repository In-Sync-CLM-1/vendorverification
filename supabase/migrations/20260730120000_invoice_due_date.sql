-- Vendors' proforma invoices and invoices often carry a payment due date;
-- capture it for invoices as its own column (advance requests already carry
-- it inside their AI-extracted JSON, no schema change needed there).
ALTER TABLE public.vendor_invoices ADD COLUMN IF NOT EXISTS due_date DATE;

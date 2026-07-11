-- ============================================================================
-- AI-parsed invoice submission
-- Vendors no longer type invoice details from scratch — an AI reads the
-- uploaded file and pre-fills the form; the vendor may correct what the AI
-- filled (or type in whatever the AI couldn't read). Once submitted, the
-- invoice's core details are locked forever — no edits by anyone.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Audit trail of what the AI actually read, alongside what got submitted.
-- ----------------------------------------------------------------------------
ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS ai_extracted_data JSONB,
  ADD COLUMN IF NOT EXISTS ai_confidence_score INTEGER,
  ADD COLUMN IF NOT EXISTS ai_model_version TEXT;

-- ----------------------------------------------------------------------------
-- 2. Lock the submitted details. Only status/review/payment-rollup columns
--    (updated elsewhere by staff actions and payment triggers) may change
--    after the row exists; the vendor-submitted facts about the bill cannot.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_vendor_invoice_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
     OR NEW.invoice_amount IS DISTINCT FROM OLD.invoice_amount
     OR NEW.gst_amount IS DISTINCT FROM OLD.gst_amount
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.po_number IS DISTINCT FROM OLD.po_number
     OR NEW.po_file_key IS DISTINCT FROM OLD.po_file_key
     OR NEW.invoice_file_key IS DISTINCT FROM OLD.invoice_file_key
  THEN
    RAISE EXCEPTION 'Invoice details are locked after submission and cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_vendor_invoice_fields ON public.vendor_invoices;
CREATE TRIGGER trg_lock_vendor_invoice_fields
  BEFORE UPDATE ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.lock_vendor_invoice_fields();

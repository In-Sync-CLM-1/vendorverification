-- ============================================================================
-- Proforma Invoice upload + AI parsing on advance requests
-- A vendor may optionally attach a Proforma Invoice when requesting an
-- advance; the same AI reader used for regular invoices (analyze-invoice)
-- reads it and the app pre-fills Amount / Activity Name for the vendor to
-- review. Purely a convenience — attaching a PI is not required to submit a
-- request. Once submitted, these fields are locked forever, same as every
-- other vendor-submitted fact on this table.
-- ============================================================================

ALTER TABLE public.vendor_advance_requests
  ADD COLUMN IF NOT EXISTS proforma_invoice_file_key TEXT,
  ADD COLUMN IF NOT EXISTS ai_extracted_data JSONB,
  ADD COLUMN IF NOT EXISTS ai_confidence_score INTEGER,
  ADD COLUMN IF NOT EXISTS ai_model_version TEXT;

CREATE OR REPLACE FUNCTION public.lock_decided_advance_request()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'pending'::public.advance_request_status THEN
    RAISE EXCEPTION 'This request has already been reviewed';
  END IF;
  NEW.tenant_id := OLD.tenant_id;
  NEW.vendor_id := OLD.vendor_id;
  NEW.requested_by := OLD.requested_by;
  NEW.amount := OLD.amount;
  NEW.activity_name := OLD.activity_name;
  NEW.vendor_remarks := OLD.vendor_remarks;
  NEW.proforma_invoice_file_key := OLD.proforma_invoice_file_key;
  NEW.ai_extracted_data := OLD.ai_extracted_data;
  NEW.ai_confidence_score := OLD.ai_confidence_score;
  NEW.ai_model_version := OLD.ai_model_version;
  RETURN NEW;
END;
$$;

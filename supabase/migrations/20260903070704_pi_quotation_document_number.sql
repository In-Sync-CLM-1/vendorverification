-- ============================================================================
-- Capture the vendor's own PI/Quotation reference number
-- ----------------------------------------------------------------------------
-- vendor_pi_quotations never stored the document's own number — only the
-- amount and date were kept from the AI extraction (see analyzeInvoiceFile's
-- InvoiceExtraction shape, which already reads invoice_number and always
-- has). With no number and, until the Groq model-deprecation fix, often no
-- amount either, a vendor with several open PIs against the same project
-- had no way to tell them apart in the picker lists.
-- ============================================================================

ALTER TABLE public.vendor_pi_quotations
  ADD COLUMN IF NOT EXISTS document_number TEXT;

-- Same lock semantics as every other AI-extracted field on this table:
-- once submitted, only status/review_comments/reviewed_by/reviewed_at may
-- change (see trg_lock_decided_pi_quotation in 20260807190000).
CREATE OR REPLACE FUNCTION public.lock_decided_pi_quotation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'submitted'::public.pi_quotation_status THEN
    RAISE EXCEPTION 'This submission has already been reviewed';
  END IF;
  NEW.tenant_id := OLD.tenant_id;
  NEW.vendor_id := OLD.vendor_id;
  NEW.submitted_by := OLD.submitted_by;
  NEW.document_type := OLD.document_type;
  NEW.file_key := OLD.file_key;
  NEW.rmpl_project_id := OLD.rmpl_project_id;
  NEW.project_number := OLD.project_number;
  NEW.project_name := OLD.project_name;
  NEW.project_owner_external_id := OLD.project_owner_external_id;
  NEW.project_owner_user_id := OLD.project_owner_user_id;
  NEW.project_owner_name := OLD.project_owner_name;
  NEW.project_owner_email := OLD.project_owner_email;
  NEW.document_date := OLD.document_date;
  NEW.document_number := OLD.document_number;
  NEW.amount := OLD.amount;
  NEW.ai_extracted_data := OLD.ai_extracted_data;
  NEW.ai_confidence_score := OLD.ai_confidence_score;
  NEW.ai_model_version := OLD.ai_model_version;
  NEW.vendor_remarks := OLD.vendor_remarks;
  RETURN NEW;
END;
$$;

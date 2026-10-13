-- ============================================================================
-- Unified vendor document -- step 1 of 6 (schema only, nothing visible changes)
--
-- One record per piece of work: it starts life as a PI / Quotation and the
-- same row becomes the invoice once the invoice is uploaded; a credit note is
-- a row of its own that points at the invoice it reduces. Payments and the PO
-- stay attached to the one row throughout (no copy, no delete, no re-point).
--
-- This step only ADDS: a stage marker, the PI-only fields, and the credit-note
-- link, and lets the invoice-only fields stay blank while a row is still a PI.
-- Every existing row is an 'invoice'-stage row, so every existing query,
-- screen and total behaves exactly as before. Later steps make the readers
-- stage-aware, move the PI data across, and switch the screens.
-- ============================================================================

ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS doc_stage TEXT NOT NULL DEFAULT 'invoice',

  -- The PI / Quotation stage, kept on the row after it becomes an invoice so
  -- the PO can keep showing it and the original approval stays on record.
  ADD COLUMN IF NOT EXISTS pi_file_key TEXT,
  ADD COLUMN IF NOT EXISTS pi_document_number TEXT,
  ADD COLUMN IF NOT EXISTS pi_document_date DATE,
  ADD COLUMN IF NOT EXISTS pi_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS pi_status public.pi_quotation_status,
  ADD COLUMN IF NOT EXISTS pi_review_comments TEXT,
  ADD COLUMN IF NOT EXISTS pi_reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS pi_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pi_vendor_remarks TEXT,
  ADD COLUMN IF NOT EXISTS pi_ai_extracted_data JSONB,
  ADD COLUMN IF NOT EXISTS pi_ai_confidence_score NUMERIC,
  ADD COLUMN IF NOT EXISTS pi_ai_model_version TEXT,
  ADD COLUMN IF NOT EXISTS project_owner_external_id UUID,

  -- Credit note -> the invoice it reduces.
  ADD COLUMN IF NOT EXISTS credit_for_invoice_id UUID REFERENCES public.vendor_invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.vendor_invoices
  DROP CONSTRAINT IF EXISTS vendor_invoices_doc_stage_check;
ALTER TABLE public.vendor_invoices
  ADD CONSTRAINT vendor_invoices_doc_stage_check
  CHECK (doc_stage IN ('proforma_invoice', 'quotation', 'invoice', 'credit_note'));

-- A PI / Quotation has no invoice number, date, amount or invoice file yet.
ALTER TABLE public.vendor_invoices ALTER COLUMN invoice_number DROP NOT NULL;
ALTER TABLE public.vendor_invoices ALTER COLUMN invoice_date DROP NOT NULL;
ALTER TABLE public.vendor_invoices ALTER COLUMN invoice_amount DROP NOT NULL;
ALTER TABLE public.vendor_invoices ALTER COLUMN invoice_file_key DROP NOT NULL;

-- ...but an invoice or credit note still must: the relaxed columns are only
-- allowed to be blank while the row is a PI / Quotation.
ALTER TABLE public.vendor_invoices
  DROP CONSTRAINT IF EXISTS vendor_invoices_stage_fields_check;
ALTER TABLE public.vendor_invoices
  ADD CONSTRAINT vendor_invoices_stage_fields_check
  CHECK (
    doc_stage IN ('proforma_invoice', 'quotation')
    OR (
      invoice_number IS NOT NULL
      AND invoice_date IS NOT NULL
      AND invoice_amount IS NOT NULL
      AND invoice_file_key IS NOT NULL
    )
  );

-- A credit note must name the invoice it reduces; nothing else may.
ALTER TABLE public.vendor_invoices
  DROP CONSTRAINT IF EXISTS vendor_invoices_credit_link_check;
ALTER TABLE public.vendor_invoices
  ADD CONSTRAINT vendor_invoices_credit_link_check
  CHECK ((doc_stage = 'credit_note') = (credit_for_invoice_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_doc_stage ON public.vendor_invoices(tenant_id, doc_stage);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_credit_for ON public.vendor_invoices(credit_for_invoice_id)
  WHERE credit_for_invoice_id IS NOT NULL;

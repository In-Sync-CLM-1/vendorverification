-- A PI / Quotation now needs two approvals: the project owner first, then
-- Accounts. Only after Accounts approves does it become "approved" and open
-- for a PO. The first approval is recorded here; status stays "submitted"
-- until Accounts decides, so every existing status check keeps working.
-- PIs already approved before this change are left as they are.

ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS pi_owner_approved_by UUID,
  ADD COLUMN IF NOT EXISTS pi_owner_approved_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.decide_pi(p_id UUID, p_approve BOOLEAN, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.vendor_invoices%ROWTYPE;
  v_final BOOLEAN;
BEGIN
  SELECT * INTO r FROM public.vendor_invoices WHERE id = p_id;
  IF NOT FOUND OR r.doc_stage NOT IN ('proforma_invoice', 'quotation') THEN
    RAISE EXCEPTION 'PI/Quotation not found';
  END IF;
  IF r.status <> 'submitted'::public.invoice_status THEN
    RAISE EXCEPTION 'This PI/Quotation has already been decided';
  END IF;
  IF NOT is_internal_staff(auth.uid()) OR get_user_tenant_id(auth.uid()) <> r.tenant_id OR is_view_only(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF r.pi_owner_approved_at IS NULL THEN
    -- Step 1: the project owner (or an admin).
    IF NOT (r.project_owner_user_id = auth.uid() OR is_admin(auth.uid())) THEN
      RAISE EXCEPTION 'Only the project owner can decide this PI/Quotation';
    END IF;
  ELSE
    -- Step 2: Accounts (or an admin).
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('accounts', 'admin', 'platform_admin')) THEN
      RAISE EXCEPTION 'Only Accounts can give the final approval on this PI/Quotation';
    END IF;
  END IF;

  IF NOT p_approve AND trim(coalesce(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'Add a comment so the vendor knows what to fix';
  END IF;

  PERFORM set_config('app.unified_rpc', '1', true);

  IF p_approve AND r.pi_owner_approved_at IS NULL THEN
    -- Project owner approved: it now waits for Accounts.
    UPDATE public.vendor_invoices
       SET pi_owner_approved_by = auth.uid(),
           pi_owner_approved_at = now(),
           pi_review_comments = NULLIF(trim(coalesce(p_comment, '')), '')
     WHERE id = p_id;
    RETURN;
  END IF;

  v_final := p_approve;
  UPDATE public.vendor_invoices
     SET status = CASE WHEN v_final THEN 'approved'::public.invoice_status ELSE 'rejected'::public.invoice_status END,
         pi_status = CASE WHEN v_final THEN 'approved'::public.pi_quotation_status ELSE 'rejected'::public.pi_quotation_status END,
         pi_review_comments = NULLIF(trim(coalesce(p_comment, '')), ''),
         pi_reviewed_by = auth.uid(),
         pi_reviewed_at = now(),
         -- a rejection sends it back to the vendor; the next submission starts both approvals again
         pi_owner_approved_by = CASE WHEN v_final THEN pi_owner_approved_by ELSE NULL END,
         pi_owner_approved_at = CASE WHEN v_final THEN pi_owner_approved_at ELSE NULL END
   WHERE id = p_id;
END;
$$;

-- A resubmitted PI starts both approvals again.
CREATE OR REPLACE FUNCTION public.resubmit_pi(
  p_id UUID, p_document_type TEXT, p_file_key TEXT, p_document_number TEXT, p_document_date DATE,
  p_amount NUMERIC, p_remarks TEXT, p_ai_data JSONB, p_ai_confidence NUMERIC, p_ai_model TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.vendor_invoices%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.vendor_invoices WHERE id = p_id;
  IF NOT FOUND OR r.doc_stage NOT IN ('proforma_invoice', 'quotation') THEN
    RAISE EXCEPTION 'PI/Quotation not found';
  END IF;
  IF NOT (is_vendor_user(auth.uid()) AND r.vendor_id = get_vendor_id(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF r.status <> 'rejected'::public.invoice_status THEN
    RAISE EXCEPTION 'Only a rejected PI/Quotation can be resubmitted';
  END IF;
  IF p_document_type NOT IN ('proforma_invoice', 'quotation') THEN
    RAISE EXCEPTION 'Choose Proforma Invoice or Quotation';
  END IF;
  IF p_file_key IS NULL THEN
    RAISE EXCEPTION 'Upload the corrected file';
  END IF;

  PERFORM set_config('app.unified_rpc', '1', true);
  UPDATE public.vendor_invoices
     SET doc_stage = p_document_type,
         pi_file_key = p_file_key,
         pi_document_number = p_document_number,
         pi_document_date = p_document_date,
         pi_amount = p_amount,
         pi_vendor_remarks = NULLIF(trim(coalesce(p_remarks, '')), ''),
         pi_ai_extracted_data = p_ai_data,
         pi_ai_confidence_score = p_ai_confidence,
         pi_ai_model_version = p_ai_model,
         status = 'submitted'::public.invoice_status,
         pi_status = 'submitted'::public.pi_quotation_status,
         pi_review_comments = NULL,
         pi_reviewed_by = NULL,
         pi_reviewed_at = NULL,
         pi_owner_approved_by = NULL,
         pi_owner_approved_at = NULL
   WHERE id = p_id;
END;
$$;

-- ============================================================================
-- Unified flow -- step 3a: database support for ONE row from PI to credit note
--
-- Everything here is additive or strictly more permissive for the app as it
-- runs today, so it can be deployed ahead of the screens:
--   * advance columns on the row (request -> paid)
--   * helpers that work out a row's net payable and settled total
--   * status roll-up that also counts the row's advance and its credit notes
--     (identical results for every existing invoice: none has either)
--   * payments may be recorded against a submitted invoice (the only approval
--     in the flow is the PI)
--   * PI-stage rows: validations, locking, and the decision / resubmit
--   * the RPCs the new screens call: decide_pi, resubmit_pi,
--     issue_po_for_row, request_advance, record_advance_payment,
--     submit_invoice_on_row, raise_credit_note
--   * copy of the existing PIs into the single table (hidden from every
--     invoice list by the stage filter already live)
-- The old PI table and its functions are untouched until the cutover.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Advance, held on the row
-- ----------------------------------------------------------------------------
ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS adv_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS adv_reason TEXT,
  ADD COLUMN IF NOT EXISTS adv_status TEXT,
  ADD COLUMN IF NOT EXISTS adv_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adv_paid_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS adv_paid_on DATE,
  ADD COLUMN IF NOT EXISTS adv_utr TEXT,
  ADD COLUMN IF NOT EXISTS adv_recorded_by UUID;

ALTER TABLE public.vendor_invoices DROP CONSTRAINT IF EXISTS vendor_invoices_adv_check;
ALTER TABLE public.vendor_invoices
  ADD CONSTRAINT vendor_invoices_adv_check
  CHECK (
    (adv_status IS NULL AND adv_amount IS NULL)
    OR (adv_status IN ('requested', 'paid') AND adv_amount IS NOT NULL AND adv_amount > 0)
  );

-- ----------------------------------------------------------------------------
-- 2. Money helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoice_net_payable(p_invoice_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.invoice_amount - COALESCE((
    SELECT SUM(c.invoice_amount) FROM public.vendor_invoices c
     WHERE c.credit_for_invoice_id = i.id AND c.doc_stage = 'credit_note'
  ), 0)
  FROM public.vendor_invoices i WHERE i.id = p_invoice_id;
$$;

CREATE OR REPLACE FUNCTION public.invoice_settled_total(p_invoice_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT SUM(p.total_settled) FROM public.vendor_invoice_payments p WHERE p.invoice_id = p_invoice_id), 0)
       + COALESCE((SELECT i.adv_paid_amount FROM public.vendor_invoices i WHERE i.id = p_invoice_id AND i.adv_status = 'paid'), 0);
$$;

REVOKE ALL ON FUNCTION public.invoice_net_payable(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invoice_settled_total(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_net_payable(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoice_settled_total(UUID) TO authenticated, service_role;

-- Status roll-up. Same rules as before; the settled total now also counts the
-- row's own advance, and the amount it is compared with is net of credit notes.
CREATE OR REPLACE FUNCTION public.refresh_invoice_payment_status(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_full BOOLEAN;
  v_net NUMERIC;
BEGIN
  v_total := public.invoice_settled_total(p_invoice_id);
  SELECT COALESCE(BOOL_OR(is_full_settlement), false) INTO v_full
    FROM public.vendor_invoice_payments WHERE invoice_id = p_invoice_id;

  IF v_total <= 0 THEN
    RETURN;
  END IF;

  v_net := public.invoice_net_payable(p_invoice_id);

  UPDATE public.vendor_invoices
     SET status = CASE
           WHEN v_full OR v_total >= v_net THEN 'paid'::public.invoice_status
           ELSE 'partially_paid'::public.invoice_status
         END
   WHERE id = p_invoice_id AND doc_stage = 'invoice';
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_invoice_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_net NUMERIC;
  v_full BOOLEAN;
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_total := public.invoice_settled_total(NEW.invoice_id);
  v_net := public.invoice_net_payable(NEW.invoice_id);
  SELECT COALESCE(BOOL_OR(is_full_settlement), false) INTO v_full
    FROM public.vendor_invoice_payments WHERE invoice_id = NEW.invoice_id;

  UPDATE public.vendor_invoices
     SET status = CASE
           WHEN v_full OR v_total >= v_net THEN 'paid'::public.invoice_status
           ELSE 'partially_paid'::public.invoice_status
         END
   WHERE id = NEW.invoice_id AND doc_stage = 'invoice';

  RETURN NEW;
END;
$$;

-- Payments may be recorded against a submitted invoice: the PI is the only
-- thing in the flow that is approved. (Legacy PI-level payments still work.)
CREATE OR REPLACE FUNCTION public.prepare_invoice_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_pi RECORD;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT i.tenant_id, i.vendor_id, i.status, i.doc_stage INTO v_inv
    FROM public.vendor_invoices i WHERE i.id = NEW.invoice_id;

    IF v_inv IS NULL THEN
      RAISE EXCEPTION 'Invoice not found';
    END IF;

    IF v_inv.doc_stage <> 'invoice' THEN
      RAISE EXCEPTION 'Payments can only be recorded against an invoice';
    END IF;

    IF v_inv.status NOT IN ('submitted'::public.invoice_status, 'under_review'::public.invoice_status,
                            'approved'::public.invoice_status, 'partially_paid'::public.invoice_status) THEN
      RAISE EXCEPTION 'Payments cannot be recorded against this invoice (status: %)', v_inv.status;
    END IF;

    NEW.tenant_id := v_inv.tenant_id;
    NEW.vendor_id := v_inv.vendor_id;
  ELSE
    SELECT q.tenant_id, q.vendor_id, q.status INTO v_pi
    FROM public.vendor_pi_quotations q WHERE q.id = NEW.pi_quotation_id;

    IF v_pi IS NULL THEN
      RAISE EXCEPTION 'PI/Quotation not found';
    END IF;

    IF v_pi.status <> 'approved'::public.pi_quotation_status THEN
      RAISE EXCEPTION 'Payments can only be recorded against an approved PI/Quotation';
    END IF;

    NEW.tenant_id := v_pi.tenant_id;
    NEW.vendor_id := v_pi.vendor_id;
  END IF;

  NEW.recorded_by := COALESCE(NEW.recorded_by, auth.uid());
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Locking rules, now stage-aware
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_vendor_invoice_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- The row itself never changes owner, vendor or kind except through the RPCs below.
  IF current_setting('app.unified_rpc', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF OLD.doc_stage IN ('proforma_invoice', 'quotation') THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.doc_stage IS DISTINCT FROM OLD.doc_stage
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
       OR NEW.invoice_amount IS DISTINCT FROM OLD.invoice_amount
       OR NEW.invoice_file_key IS DISTINCT FROM OLD.invoice_file_key
       OR NEW.pi_file_key IS DISTINCT FROM OLD.pi_file_key
       OR NEW.pi_document_number IS DISTINCT FROM OLD.pi_document_number
       OR NEW.pi_document_date IS DISTINCT FROM OLD.pi_document_date
       OR NEW.pi_amount IS DISTINCT FROM OLD.pi_amount
       OR NEW.rmpl_project_id IS DISTINCT FROM OLD.rmpl_project_id
       OR NEW.project_owner_user_id IS DISTINCT FROM OLD.project_owner_user_id
    THEN
      RAISE EXCEPTION 'A PI/Quotation cannot be edited. If it was rejected, use Fix and resubmit.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.doc_stage IS DISTINCT FROM OLD.doc_stage
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

-- ----------------------------------------------------------------------------
-- 4. Insert rules, by stage
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_vendor_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor RECORD;
BEGIN
  SELECT v.tenant_id, v.current_status INTO v_vendor
  FROM public.vendors v WHERE v.id = NEW.vendor_id;

  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  NEW.tenant_id := v_vendor.tenant_id;
  NEW.submitted_by := COALESCE(NEW.submitted_by, auth.uid());

  -- Copying the existing PIs into the single table: keep them exactly as they are.
  IF current_setting('app.unified_backfill', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.doc_stage IN ('proforma_invoice', 'quotation') THEN
    IF is_vendor_user(auth.uid()) THEN
      IF v_vendor.current_status <> 'approved'::public.vendor_status THEN
        RAISE EXCEPTION 'Only approved vendors can submit a PI or Quotation';
      END IF;
      IF NEW.vendor_id <> get_vendor_id(auth.uid()) THEN
        RAISE EXCEPTION 'Cannot submit a PI or Quotation for another vendor';
      END IF;
    END IF;
    IF NEW.rmpl_project_id IS NULL OR trim(coalesce(NEW.project_name, '')) = '' THEN
      RAISE EXCEPTION 'Pick a project before submitting';
    END IF;
    IF NEW.project_owner_user_id IS NULL THEN
      RAISE EXCEPTION 'This project''s owner could not be matched to a staff account — contact your point of contact before submitting';
    END IF;
    IF NEW.pi_file_key IS NULL THEN
      RAISE EXCEPTION 'Upload the PI or Quotation file';
    END IF;

    NEW.status := 'submitted'::public.invoice_status;
    NEW.pi_status := 'submitted'::public.pi_quotation_status;
    NEW.pi_reviewed_by := NULL;
    NEW.pi_reviewed_at := NULL;
    NEW.pi_review_comments := NULL;
    NEW.invoice_number := NULL;
    NEW.invoice_date := NULL;
    NEW.invoice_amount := NULL;
    NEW.invoice_file_key := NULL;
    NEW.credit_for_invoice_id := NULL;
    NEW.adv_amount := NULL;
    NEW.adv_status := NULL;
    RETURN NEW;
  END IF;

  IF NEW.doc_stage = 'credit_note' THEN
    IF current_setting('app.unified_rpc', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'Credit notes are raised from the Billing screen';
    END IF;
    RETURN NEW;
  END IF;

  IF is_vendor_user(auth.uid()) THEN
    IF v_vendor.current_status <> 'approved'::public.vendor_status THEN
      RAISE EXCEPTION 'Only approved vendors can submit invoices';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders po
       WHERE po.vendor_id = NEW.vendor_id AND po.invoice_id IS NULL AND po.pi_quotation_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'No Purchase Order has been issued yet -- an invoice cannot be submitted without one';
    END IF;
    NEW.status := 'submitted'::public.invoice_status;
  END IF;

  RETURN NEW;
END;
$$;

-- A credit note changes what is still owed on its invoice.
CREATE OR REPLACE FUNCTION public.refresh_parent_on_credit_note()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_invoice_payment_status(NEW.credit_for_invoice_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_parent_on_credit_note ON public.vendor_invoices;
CREATE TRIGGER trg_refresh_parent_on_credit_note
  AFTER INSERT ON public.vendor_invoices
  FOR EACH ROW WHEN (NEW.doc_stage = 'credit_note')
  EXECUTE FUNCTION public.refresh_parent_on_credit_note();

-- ----------------------------------------------------------------------------
-- 5. Copy the existing PIs into the single table. Safe to run again: it adds
--    what is missing and refreshes the decision on rows still at PI stage.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_unified_from_legacy_pi()
RETURNS TABLE (inserted INT, updated INT, carried INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ins INT; v_upd INT; v_car INT;
BEGIN
  PERFORM set_config('app.unified_backfill', '1', true);
  PERFORM set_config('app.unified_rpc', '1', true);

  INSERT INTO public.vendor_invoices (
    id, tenant_id, vendor_id, submitted_by, doc_stage, status,
    rmpl_project_id, project_number, project_name,
    project_owner_external_id, project_owner_user_id, project_owner_name, project_owner_email,
    pi_file_key, pi_document_number, pi_document_date, pi_amount,
    pi_status, pi_review_comments, pi_reviewed_by, pi_reviewed_at, pi_vendor_remarks,
    pi_ai_extracted_data, pi_ai_confidence_score, pi_ai_model_version, created_at
  )
  SELECT q.id, q.tenant_id, q.vendor_id, q.submitted_by,
         CASE WHEN q.document_type = 'quotation' THEN 'quotation' ELSE 'proforma_invoice' END,
         q.status::text::public.invoice_status,
         q.rmpl_project_id, q.project_number, q.project_name,
         q.project_owner_external_id, q.project_owner_user_id, q.project_owner_name, q.project_owner_email,
         q.file_key, q.document_number, q.document_date, q.amount,
         q.status, q.review_comments, q.reviewed_by, q.reviewed_at, q.vendor_remarks,
         q.ai_extracted_data, q.ai_confidence_score, q.ai_model_version, q.created_at
    FROM public.vendor_pi_quotations q
   WHERE NOT EXISTS (SELECT 1 FROM public.vendor_invoices v WHERE v.id = q.id);
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  UPDATE public.vendor_invoices v
     SET status = q.status::text::public.invoice_status,
         pi_status = q.status,
         pi_review_comments = q.review_comments,
         pi_reviewed_by = q.reviewed_by,
         pi_reviewed_at = q.reviewed_at
    FROM public.vendor_pi_quotations q
   WHERE v.id = q.id
     AND v.doc_stage IN ('proforma_invoice', 'quotation')
     AND (v.pi_status IS DISTINCT FROM q.status
          OR v.pi_review_comments IS DISTINCT FROM q.review_comments);
  GET DIAGNOSTICS v_upd = ROW_COUNT;

  -- Invoices that came from a PI keep their PI file (the PO holds the copy).
  UPDATE public.vendor_invoices v
     SET pi_file_key = po.pi_file_key
    FROM public.purchase_orders po
   WHERE po.invoice_id = v.id AND v.doc_stage = 'invoice'
     AND v.pi_file_key IS NULL AND po.pi_file_key IS NOT NULL;
  GET DIAGNOSTICS v_car = ROW_COUNT;

  RETURN QUERY SELECT v_ins, v_upd, v_car;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_unified_from_legacy_pi() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_unified_from_legacy_pi() TO service_role;

SELECT * FROM public.sync_unified_from_legacy_pi();

-- ----------------------------------------------------------------------------
-- 6. RPCs used by the new screens
-- ----------------------------------------------------------------------------
-- PI decision: only the project's approver (or an admin) while it is waiting.
CREATE OR REPLACE FUNCTION public.decide_pi(p_id UUID, p_approve BOOLEAN, p_comment TEXT DEFAULT NULL)
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
  IF r.status <> 'submitted'::public.invoice_status THEN
    RAISE EXCEPTION 'This PI/Quotation has already been decided';
  END IF;
  IF NOT is_internal_staff(auth.uid()) OR get_user_tenant_id(auth.uid()) <> r.tenant_id OR is_view_only(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT (r.project_owner_user_id = auth.uid() OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only the project owner can decide this PI/Quotation';
  END IF;
  IF NOT p_approve AND trim(coalesce(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'Add a comment so the vendor knows what to fix';
  END IF;

  PERFORM set_config('app.unified_rpc', '1', true);
  UPDATE public.vendor_invoices
     SET status = CASE WHEN p_approve THEN 'approved'::public.invoice_status ELSE 'rejected'::public.invoice_status END,
         pi_status = CASE WHEN p_approve THEN 'approved'::public.pi_quotation_status ELSE 'rejected'::public.pi_quotation_status END,
         pi_review_comments = NULLIF(trim(coalesce(p_comment, '')), ''),
         pi_reviewed_by = auth.uid(),
         pi_reviewed_at = now()
   WHERE id = p_id;
END;
$$;

-- Fix and resubmit a rejected PI on the same row.
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
         pi_reviewed_at = NULL
   WHERE id = p_id;
END;
$$;

-- Issue the PO against an approved PI/Quotation row.
CREATE OR REPLACE FUNCTION public.issue_po_for_row(
  p_row_id UUID, p_description TEXT, p_hsn_sac TEXT, p_place_of_supply TEXT,
  p_taxable_amount NUMERIC, p_tax_type TEXT, p_tax_rate NUMERIC, p_po_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.vendor_invoices%ROWTYPE;
  v_vendor_name TEXT;
  v_vendor_address TEXT;
  v_vendor_gstin TEXT;
  v_vendor_pan TEXT;
  v_tenant public.tenants%ROWTYPE;
  v_tax_amount NUMERIC;
  v_po public.purchase_orders;
BEGIN
  SELECT * INTO r FROM public.vendor_invoices WHERE id = p_row_id;
  IF NOT FOUND OR r.doc_stage NOT IN ('proforma_invoice', 'quotation') THEN
    RAISE EXCEPTION 'PI/Quotation not found';
  END IF;

  IF NOT (is_internal_staff(auth.uid()) AND get_user_tenant_id(auth.uid()) = r.tenant_id AND NOT is_view_only(auth.uid())
          AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('accounts', 'admin', 'platform_admin'))) THEN
    RAISE EXCEPTION 'Only Accounts/Admin may issue a Purchase Order';
  END IF;

  IF r.status <> 'approved'::public.invoice_status THEN
    RAISE EXCEPTION 'A Purchase Order can only be issued against an approved PI/Quotation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE invoice_id = p_row_id OR pi_quotation_id = p_row_id) THEN
    RAISE EXCEPTION 'A Purchase Order has already been issued against this PI/Quotation';
  END IF;

  IF p_taxable_amount IS NULL OR p_taxable_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid taxable amount';
  END IF;
  IF trim(coalesce(p_description, '')) = '' THEN
    RAISE EXCEPTION 'Enter a description of the work';
  END IF;
  IF trim(coalesce(p_place_of_supply, '')) = '' THEN
    RAISE EXCEPTION 'Enter the place of supply';
  END IF;

  SELECT v.company_name,
         coalesce(v.operational_address, v.registered_address),
         coalesce(decrypt_pii(v.gst_number_encrypted), v.gst_number),
         coalesce(decrypt_pii(v.pan_number_encrypted), v.pan_number)
    INTO v_vendor_name, v_vendor_address, v_vendor_gstin, v_vendor_pan
  FROM public.vendors v WHERE v.id = r.vendor_id;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = r.tenant_id;

  v_tax_amount := CASE WHEN p_tax_type = 'none' THEN 0 ELSE ROUND(p_taxable_amount * p_tax_rate / 100, 2) END;

  INSERT INTO public.purchase_orders (
    tenant_id, vendor_id, invoice_id, po_date,
    vendor_name, vendor_address, vendor_gstin, vendor_pan,
    issuer_name, issuer_address, issuer_gstin,
    project_number, project_name, project_manager, place_of_supply,
    description, hsn_sac, taxable_amount, tax_type, tax_rate, tax_amount, grand_total,
    pi_file_key, pi_document_type, issued_by
  ) VALUES (
    r.tenant_id, r.vendor_id, p_row_id, p_po_date,
    v_vendor_name, v_vendor_address, v_vendor_gstin, v_vendor_pan,
    v_tenant.name, v_tenant.billing_address, v_tenant.gstin,
    r.project_number, r.project_name, r.project_owner_name, p_place_of_supply,
    p_description, p_hsn_sac, p_taxable_amount, p_tax_type, p_tax_rate, v_tax_amount, p_taxable_amount + v_tax_amount,
    r.pi_file_key, r.doc_stage, auth.uid()
  ) RETURNING * INTO v_po;

  RETURN v_po;
END;
$$;

-- Vendor asks for an advance against the PO (once, up to the PO amount).
CREATE OR REPLACE FUNCTION public.request_advance(p_id UUID, p_amount NUMERIC, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.vendor_invoices%ROWTYPE;
  v_po_total NUMERIC;
BEGIN
  SELECT * INTO r FROM public.vendor_invoices WHERE id = p_id;
  IF NOT FOUND OR r.doc_stage NOT IN ('proforma_invoice', 'quotation') THEN
    RAISE EXCEPTION 'An advance can only be requested before the invoice is uploaded';
  END IF;
  IF NOT (is_vendor_user(auth.uid()) AND r.vendor_id = get_vendor_id(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF r.adv_status IS NOT NULL THEN
    RAISE EXCEPTION 'An advance has already been requested for this PO';
  END IF;
  SELECT grand_total INTO v_po_total FROM public.purchase_orders WHERE invoice_id = p_id OR pi_quotation_id = p_id LIMIT 1;
  IF v_po_total IS NULL THEN
    RAISE EXCEPTION 'An advance can only be requested once the PO is issued';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid advance amount';
  END IF;
  IF p_amount > v_po_total + 1 THEN
    RAISE EXCEPTION 'The advance cannot be more than the PO amount (%)', to_char(v_po_total, 'FM999,999,999.00');
  END IF;
  IF trim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Say what the advance is for';
  END IF;

  PERFORM set_config('app.unified_rpc', '1', true);
  UPDATE public.vendor_invoices
     SET adv_amount = p_amount, adv_reason = trim(p_reason), adv_status = 'requested', adv_requested_at = now()
   WHERE id = p_id;
END;
$$;

-- Accounts records the advance payment.
CREATE OR REPLACE FUNCTION public.record_advance_payment(p_id UUID, p_paid_on DATE, p_amount NUMERIC, p_utr TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.vendor_invoices%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.vendor_invoices WHERE id = p_id;
  IF NOT FOUND OR r.adv_status IS NULL THEN
    RAISE EXCEPTION 'No advance was requested on this row';
  END IF;
  IF NOT (is_internal_staff(auth.uid()) AND get_user_tenant_id(auth.uid()) = r.tenant_id AND NOT is_view_only(auth.uid())
          AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('accounts', 'admin', 'platform_admin'))) THEN
    RAISE EXCEPTION 'Only Accounts/Admin may record a payment';
  END IF;
  IF r.adv_status <> 'requested' THEN
    RAISE EXCEPTION 'This advance has already been paid';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > r.adv_amount + 1 THEN
    RAISE EXCEPTION 'Enter the amount paid (up to %)', to_char(r.adv_amount, 'FM999,999,999.00');
  END IF;
  IF trim(coalesce(p_utr, '')) = '' THEN
    RAISE EXCEPTION 'Enter the bank reference';
  END IF;

  PERFORM set_config('app.unified_rpc', '1', true);
  UPDATE public.vendor_invoices
     SET adv_status = 'paid', adv_paid_amount = p_amount, adv_paid_on = COALESCE(p_paid_on, CURRENT_DATE),
         adv_utr = trim(p_utr), adv_recorded_by = auth.uid()
   WHERE id = p_id;

  IF r.doc_stage = 'invoice' THEN
    PERFORM public.refresh_invoice_payment_status(p_id);
  END IF;
END;
$$;

-- The invoice takes the place of the PI on the same row.
CREATE OR REPLACE FUNCTION public.submit_invoice_on_row(
  p_id UUID, p_number TEXT, p_date DATE, p_amount NUMERIC, p_gst NUMERIC, p_description TEXT,
  p_file_key TEXT, p_due DATE, p_ai_data JSONB, p_ai_confidence INTEGER, p_ai_model TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.vendor_invoices%ROWTYPE;
  v_po public.purchase_orders;
BEGIN
  SELECT * INTO r FROM public.vendor_invoices WHERE id = p_id;
  IF NOT FOUND OR r.doc_stage NOT IN ('proforma_invoice', 'quotation') THEN
    RAISE EXCEPTION 'This PI/Quotation has already been invoiced';
  END IF;
  IF NOT (is_vendor_user(auth.uid()) AND r.vendor_id = get_vendor_id(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF (SELECT current_status FROM public.vendors WHERE id = r.vendor_id) <> 'approved'::public.vendor_status THEN
    RAISE EXCEPTION 'Only approved vendors can submit invoices';
  END IF;
  IF r.status <> 'approved'::public.invoice_status THEN
    RAISE EXCEPTION 'The PI/Quotation has not been approved';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE invoice_id = p_id OR pi_quotation_id = p_id LIMIT 1;
  IF v_po.id IS NULL THEN
    RAISE EXCEPTION 'No Purchase Order has been issued yet -- an invoice cannot be submitted without one';
  END IF;
  IF trim(coalesce(p_number, '')) = '' OR p_date IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_file_key IS NULL THEN
    RAISE EXCEPTION 'Invoice number, date, amount and file are needed';
  END IF;
  IF p_amount > v_po.grand_total + 1 THEN
    RAISE EXCEPTION 'The invoice (%) is more than the PO amount (%)',
      to_char(p_amount, 'FM999,999,999.00'), to_char(v_po.grand_total, 'FM999,999,999.00');
  END IF;

  PERFORM set_config('app.unified_rpc', '1', true);
  UPDATE public.vendor_invoices
     SET doc_stage = 'invoice',
         invoice_number = trim(p_number),
         invoice_date = p_date,
         invoice_amount = p_amount,
         gst_amount = COALESCE(p_gst, 0),
         description = p_description,
         invoice_file_key = p_file_key,
         due_date = p_due,
         po_number = v_po.po_number,
         ai_extracted_data = p_ai_data,
         ai_confidence_score = p_ai_confidence,
         ai_model_version = p_ai_model,
         status = 'submitted'::public.invoice_status,
         rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL
   WHERE id = p_id;

  PERFORM public.refresh_invoice_payment_status(p_id);
END;
$$;

-- A credit note is its own row, linked to the invoice it reduces.
CREATE OR REPLACE FUNCTION public.raise_credit_note(
  p_invoice_id UUID, p_number TEXT, p_date DATE, p_amount NUMERIC, p_reason TEXT, p_file_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.vendor_invoices%ROWTYPE;
  v_credited NUMERIC;
  v_id UUID;
BEGIN
  SELECT * INTO r FROM public.vendor_invoices WHERE id = p_invoice_id;
  IF NOT FOUND OR r.doc_stage <> 'invoice' THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF NOT (is_vendor_user(auth.uid()) AND r.vendor_id = get_vendor_id(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF trim(coalesce(p_number, '')) = '' OR p_date IS NULL OR p_file_key IS NULL OR trim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Credit note number, date, reason and file are needed';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter the credit note amount';
  END IF;
  SELECT COALESCE(SUM(invoice_amount), 0) INTO v_credited
    FROM public.vendor_invoices WHERE credit_for_invoice_id = p_invoice_id AND doc_stage = 'credit_note';
  IF p_amount > r.invoice_amount - v_credited + 0.5 THEN
    RAISE EXCEPTION 'A credit note cannot be more than %, the part of the invoice not yet credited',
      to_char(r.invoice_amount - v_credited, 'FM999,999,999.00');
  END IF;

  PERFORM set_config('app.unified_rpc', '1', true);
  INSERT INTO public.vendor_invoices (
    vendor_id, tenant_id, doc_stage, credit_for_invoice_id, status,
    invoice_number, invoice_date, invoice_amount, gst_amount, description, invoice_file_key,
    rmpl_project_id, project_number, project_name, project_owner_user_id, project_owner_name, project_owner_email,
    submitted_by
  ) VALUES (
    r.vendor_id, r.tenant_id, 'credit_note', p_invoice_id, 'approved'::public.invoice_status,
    trim(p_number), p_date, p_amount, 0, trim(p_reason), p_file_key,
    r.rmpl_project_id, r.project_number, r.project_name, r.project_owner_user_id, r.project_owner_name, r.project_owner_email,
    auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'decide_pi(uuid,boolean,text)',
    'resubmit_pi(uuid,text,text,text,date,numeric,text,jsonb,numeric,text)',
    'issue_po_for_row(uuid,text,text,text,numeric,text,numeric,date)',
    'request_advance(uuid,numeric,text)',
    'record_advance_payment(uuid,date,numeric,text)',
    'submit_invoice_on_row(uuid,text,date,numeric,numeric,text,text,date,jsonb,integer,text)',
    'raise_credit_note(uuid,text,date,numeric,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

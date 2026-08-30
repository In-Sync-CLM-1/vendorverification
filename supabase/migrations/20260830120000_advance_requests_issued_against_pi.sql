-- ============================================================================
-- Advance requests are now issued against an approved PI/Quotation, not a
-- free-text description with its own separate document upload.
--
-- Previously a vendor typed an activity name from scratch and could attach a
-- fresh copy of a proforma invoice, which the same AI reader parsed all over
-- again. Meanwhile the real PI/Quotation flow already carries that exact
-- document, its amount, and its project, approved by the project owner.
-- Running an advance as a second, disconnected free-text ask meant duplicate
-- data entry and let a request go in for any amount with no ceiling tied to
-- what was actually approved.
--
-- From here: a vendor picks one of their own APPROVED PI/Quotations, the
-- amount is capped at what's left of that PI's approved value, and the
-- request is routed to the same Project Owner who approved the PI — not to
-- generic staff. Staff/Accounts keep read-only oversight (they still process
-- the resulting payment/netting), they just never held the approve decision
-- here going forward.
-- ============================================================================

ALTER TABLE public.vendor_advance_requests
  ADD COLUMN IF NOT EXISTS pi_quotation_id UUID REFERENCES public.vendor_pi_quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_owner_user_id UUID,
  ADD COLUMN IF NOT EXISTS project_owner_name TEXT,
  ADD COLUMN IF NOT EXISTS project_owner_email TEXT;

CREATE INDEX IF NOT EXISTS idx_vendor_advance_requests_pi_quotation
  ON public.vendor_advance_requests(pi_quotation_id);
CREATE INDEX IF NOT EXISTS idx_vendor_advance_requests_project_owner
  ON public.vendor_advance_requests(project_owner_user_id);

-- ----------------------------------------------------------------------------
-- Every advance now must name an approved PI/Quotation belonging to the same
-- vendor. Everything about "where this money is going" (project, project
-- owner, the document itself) is copied from that PI — the vendor no longer
-- types or uploads any of it. The amount is capped against what's left of the
-- PI's approved value once existing non-rejected requests against it are
-- accounted for, so the same PI can't be advanced against twice over.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_vendor_advance_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor RECORD;
  v_pi public.vendor_pi_quotations%ROWTYPE;
  v_already_requested NUMERIC;
BEGIN
  SELECT v.tenant_id, v.current_status INTO v_vendor
  FROM public.vendors v WHERE v.id = NEW.vendor_id;

  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  NEW.tenant_id := v_vendor.tenant_id;
  NEW.requested_by := COALESCE(NEW.requested_by, auth.uid());
  NEW.status := 'pending'::public.advance_request_status;
  NEW.project_id := NULL;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.review_comments := NULL;

  IF is_vendor_user(auth.uid()) THEN
    IF v_vendor.current_status <> 'approved'::public.vendor_status THEN
      RAISE EXCEPTION 'Only approved vendors can request an advance';
    END IF;
    IF NEW.vendor_id <> get_vendor_id(auth.uid()) THEN
      RAISE EXCEPTION 'Cannot request an advance for another vendor';
    END IF;
  END IF;

  IF NEW.pi_quotation_id IS NULL THEN
    RAISE EXCEPTION 'Pick the approved PI/Quotation this advance is issued against';
  END IF;

  SELECT * INTO v_pi FROM public.vendor_pi_quotations WHERE id = NEW.pi_quotation_id;
  IF v_pi IS NULL THEN
    RAISE EXCEPTION 'PI/Quotation not found';
  END IF;
  IF v_pi.vendor_id <> NEW.vendor_id THEN
    RAISE EXCEPTION 'This PI/Quotation belongs to a different vendor';
  END IF;
  IF v_pi.status <> 'approved'::public.pi_quotation_status THEN
    RAISE EXCEPTION 'An advance can only be requested against an approved PI/Quotation';
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid advance amount';
  END IF;

  IF v_pi.amount IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_already_requested
    FROM public.vendor_advance_requests
    WHERE pi_quotation_id = NEW.pi_quotation_id
      AND status <> 'rejected'::public.advance_request_status;

    IF v_already_requested + NEW.amount > v_pi.amount + 1 THEN
      RAISE EXCEPTION
        'This advance would exceed the approved PI amount (% already requested/approved of %)',
        to_char(v_already_requested, 'FM999,999,999.00'),
        to_char(v_pi.amount, 'FM999,999,999.00');
    END IF;
  END IF;

  -- Everything about what this advance is for comes from the PI, not the vendor.
  NEW.activity_name := format(
    '%s · %s',
    CASE WHEN v_pi.document_type = 'quotation' THEN 'Quotation' ELSE 'Proforma Invoice' END,
    v_pi.project_name
  );
  NEW.project_name := v_pi.project_name;
  NEW.project_owner_user_id := v_pi.project_owner_user_id;
  NEW.project_owner_name := v_pi.project_owner_name;
  NEW.project_owner_email := v_pi.project_owner_email;
  NEW.proforma_invoice_file_key := v_pi.file_key;
  NEW.ai_extracted_data := v_pi.ai_extracted_data;
  NEW.ai_confidence_score := v_pi.ai_confidence_score;
  NEW.ai_model_version := v_pi.ai_model_version;

  RETURN NEW;
END;
$$;

-- Once decided, lock everything the vendor/PI originally supplied — reviewer
-- UPDATEs may only set status / review_comments / reviewed_by / reviewed_at,
-- and only while still pending. project_name now comes from the linked PI at
-- insert time (staff no longer assign a project at decision time).
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
  NEW.pi_quotation_id := OLD.pi_quotation_id;
  NEW.project_id := OLD.project_id;
  NEW.project_name := OLD.project_name;
  NEW.project_owner_user_id := OLD.project_owner_user_id;
  NEW.project_owner_name := OLD.project_owner_name;
  NEW.project_owner_email := OLD.project_owner_email;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- RLS: the actual flaw being fixed. "Staff review advance requests" let ANY
-- internal staff member (including Accounts, who only ever processes the
-- resulting payment) decide an advance. Approval now follows the PI it's
-- issued against — only that PI's Project Owner may decide, same as PI
-- approval itself. Admins keep an override for fix-ups. Staff/Accounts keep
-- their existing read-only visibility.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff review advance requests" ON public.vendor_advance_requests;

CREATE POLICY "Project owner reviews advance requests"
  ON public.vendor_advance_requests FOR UPDATE TO authenticated
  USING (
    (project_owner_user_id = auth.uid() AND status = 'pending'::public.advance_request_status AND NOT is_view_only(auth.uid()))
    OR (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()))
  )
  WITH CHECK (
    (project_owner_user_id = auth.uid() AND tenant_id = get_user_tenant_id(auth.uid()) AND NOT is_view_only(auth.uid()))
    OR (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()))
  );

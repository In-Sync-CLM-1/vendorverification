-- TASK-2669: a project owner could not approve a PI (or decide an advance
-- request) when their account is read-only, because the read-only check ran
-- before the "is this their project" check. What a person can do follows
-- their function, so the owner of the project decides, whatever account type
-- they hold. Accounts-only actions are untouched.

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
  IF NOT is_internal_staff(auth.uid()) OR get_user_tenant_id(auth.uid()) <> r.tenant_id THEN
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

DROP POLICY IF EXISTS "Project owner reviews advance requests" ON public.vendor_advance_requests;
CREATE POLICY "Project owner reviews advance requests"
  ON public.vendor_advance_requests FOR UPDATE TO authenticated
  USING (
    (project_owner_user_id = auth.uid() AND status = 'pending'::public.advance_request_status)
    OR (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()))
  )
  WITH CHECK (
    (project_owner_user_id = auth.uid() AND tenant_id = get_user_tenant_id(auth.uid()))
    OR (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()))
  );

-- Advance requests raised before they were tied to a PI have no owner, so
-- nobody can decide them. With no owner, the decision goes to Accounts
-- (Manoj Mishra). New advance requests copy the owner from their PI, which
-- always has one.
DO $$
DECLARE
  v_user UUID;
  v_name TEXT;
BEGIN
  SELECT m.user_id, m.full_name INTO v_user, v_name
    FROM public.find_staff_by_emails(ARRAY['accounts@redefine.in']) m
    JOIN public.tenants t ON t.id = m.tenant_id
   LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'Accounts approver not found; ownerless advance requests left as they were';
    RETURN;
  END IF;
  UPDATE public.vendor_advance_requests
     SET project_owner_user_id = v_user,
         project_owner_name = v_name,
         project_owner_email = 'accounts@redefine.in'
   WHERE project_owner_user_id IS NULL
     AND status = 'pending'::public.advance_request_status
     AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE user_id = v_user LIMIT 1);
END;
$$;

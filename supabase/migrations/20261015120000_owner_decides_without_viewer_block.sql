-- TASK-2669: a project owner could not approve a PI (or decide an advance
-- request) when their account is read-only, because the read-only check ran
-- before the "is this their project" check. What a person can do follows
-- their function, so the owner of the project decides, whatever account type
-- they hold. Accounts-only actions are untouched.
--
-- Also: a PI/Quotation now has a named approval stage (awaiting_owner ->
-- awaiting_accounts -> approved, or rejected) that everything reads; exactly one
-- decision is allowed per stage per submission; decide_pi locks the row while
-- deciding; and a vendor cannot submit the same PI number twice for a project.

-- ----------------------------------------------------------------------------
-- Named approval stage. Until now the stage was guessed from a timestamp
-- (pi_owner_approved_at) while status stayed "submitted" for both steps.
--   awaiting_owner    -> the project owner decides
--   awaiting_accounts -> the owner approved; Accounts decides
--   approved / rejected
-- Only decide_pi / resubmit_pi move it, and only along these edges.
-- ----------------------------------------------------------------------------
ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS pi_approval_stage TEXT,
  ADD COLUMN IF NOT EXISTS pi_cycle INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.vendor_invoices DROP CONSTRAINT IF EXISTS vendor_invoices_pi_approval_stage_check;
ALTER TABLE public.vendor_invoices
  ADD CONSTRAINT vendor_invoices_pi_approval_stage_check
  CHECK (pi_approval_stage IS NULL OR pi_approval_stage IN ('awaiting_owner', 'awaiting_accounts', 'approved', 'rejected'));

-- One row per decision. UNIQUE (row, submission cycle, stage) is what makes
-- "one decision per stage" true in the database itself, whatever the callers do.
CREATE TABLE IF NOT EXISTS public.pi_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id UUID NOT NULL REFERENCES public.vendor_invoices(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  cycle INTEGER NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('owner', 'accounts')),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_by UUID,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  comment TEXT,
  CONSTRAINT pi_decisions_one_per_stage UNIQUE (row_id, cycle, stage)
);
ALTER TABLE public.pi_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff view PI decisions" ON public.pi_decisions;
CREATE POLICY "Staff view PI decisions"
  ON public.pi_decisions FOR SELECT TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_pi_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.doc_stage IN ('proforma_invoice', 'quotation') THEN
      NEW.pi_approval_stage := 'awaiting_owner';
      NEW.pi_cycle := 1;
    ELSE
      NEW.pi_approval_stage := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.pi_approval_stage IS DISTINCT FROM OLD.pi_approval_stage THEN
    IF current_setting('app.unified_rpc', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'A PI/Quotation moves between stages only through approval';
    END IF;
    IF NOT (
      OLD.pi_approval_stage IS NULL
      OR (OLD.pi_approval_stage = 'awaiting_owner' AND NEW.pi_approval_stage IN ('awaiting_accounts', 'rejected'))
      OR (OLD.pi_approval_stage = 'awaiting_accounts' AND NEW.pi_approval_stage IN ('approved', 'rejected'))
      OR (OLD.pi_approval_stage = 'rejected' AND NEW.pi_approval_stage = 'awaiting_owner')
    ) THEN
      RAISE EXCEPTION 'A PI/Quotation cannot move from % to %', OLD.pi_approval_stage, NEW.pi_approval_stage;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pi_stage ON public.vendor_invoices;
CREATE TRIGGER trg_guard_pi_stage
  BEFORE INSERT OR UPDATE ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_pi_stage();

-- Existing PIs/Quotations take the stage they are in today, and their past
-- decisions are recorded so the history is complete.
DO $$
BEGIN
  PERFORM set_config('app.unified_rpc', '1', true);
  UPDATE public.vendor_invoices
     SET pi_approval_stage = CASE
           WHEN status = 'approved'::public.invoice_status OR pi_status = 'approved'::public.pi_quotation_status THEN 'approved'
           WHEN status = 'rejected'::public.invoice_status OR pi_status = 'rejected'::public.pi_quotation_status THEN 'rejected'
           WHEN pi_owner_approved_at IS NOT NULL THEN 'awaiting_accounts'
           ELSE 'awaiting_owner'
         END
   WHERE doc_stage IN ('proforma_invoice', 'quotation')
     AND pi_approval_stage IS NULL;

  INSERT INTO public.pi_decisions (row_id, tenant_id, cycle, stage, decision, decided_by, decided_at, comment)
  SELECT id, tenant_id, 1, 'owner', 'approved', pi_owner_approved_by, pi_owner_approved_at, NULL
    FROM public.vendor_invoices
   WHERE doc_stage IN ('proforma_invoice', 'quotation') AND pi_owner_approved_at IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO public.pi_decisions (row_id, tenant_id, cycle, stage, decision, decided_by, decided_at, comment)
  SELECT id, tenant_id, 1,
         CASE WHEN pi_owner_approved_at IS NOT NULL THEN 'accounts' ELSE 'owner' END,
         CASE WHEN pi_approval_stage = 'approved' THEN 'approved' ELSE 'rejected' END,
         pi_reviewed_by, pi_reviewed_at, pi_review_comments
    FROM public.vendor_invoices
   WHERE doc_stage IN ('proforma_invoice', 'quotation')
     AND pi_approval_stage IN ('approved', 'rejected')
     AND pi_reviewed_at IS NOT NULL
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_pi(p_id UUID, p_approve BOOLEAN, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.vendor_invoices%ROWTYPE;
  v_stage TEXT;
BEGIN
  -- Locked, so two decisions at the same moment run one after the other.
  SELECT * INTO r FROM public.vendor_invoices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.doc_stage NOT IN ('proforma_invoice', 'quotation') THEN
    RAISE EXCEPTION 'PI/Quotation not found';
  END IF;
  IF r.pi_approval_stage NOT IN ('awaiting_owner', 'awaiting_accounts') THEN
    RAISE EXCEPTION 'This PI/Quotation has already been decided';
  END IF;
  IF NOT is_internal_staff(auth.uid()) OR get_user_tenant_id(auth.uid()) <> r.tenant_id THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF r.pi_approval_stage = 'awaiting_owner' THEN
    v_stage := 'owner';
    IF NOT (r.project_owner_user_id = auth.uid() OR is_admin(auth.uid())) THEN
      RAISE EXCEPTION 'Only the project owner can decide this PI/Quotation';
    END IF;
  ELSE
    v_stage := 'accounts';
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('accounts', 'admin', 'platform_admin')) THEN
      RAISE EXCEPTION 'Only Accounts can give the final approval on this PI/Quotation';
    END IF;
  END IF;

  IF NOT p_approve AND trim(coalesce(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'Add a comment so the vendor knows what to fix';
  END IF;

  -- The one decision for this stage. A second attempt hits the unique rule.
  BEGIN
    INSERT INTO public.pi_decisions (row_id, tenant_id, cycle, stage, decision, decided_by, comment)
    VALUES (r.id, r.tenant_id, r.pi_cycle, v_stage,
            CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
            auth.uid(), NULLIF(trim(coalesce(p_comment, '')), ''));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This stage has already been decided';
  END;

  PERFORM set_config('app.unified_rpc', '1', true);

  IF p_approve AND v_stage = 'owner' THEN
    -- Owner approved: it now waits for Accounts.
    UPDATE public.vendor_invoices
       SET pi_approval_stage = 'awaiting_accounts',
           pi_owner_approved_by = auth.uid(),
           pi_owner_approved_at = now(),
           pi_review_comments = NULLIF(trim(coalesce(p_comment, '')), '')
     WHERE id = p_id;
    RETURN;
  END IF;

  UPDATE public.vendor_invoices
     SET pi_approval_stage = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         status = CASE WHEN p_approve THEN 'approved'::public.invoice_status ELSE 'rejected'::public.invoice_status END,
         pi_status = CASE WHEN p_approve THEN 'approved'::public.pi_quotation_status ELSE 'rejected'::public.pi_quotation_status END,
         pi_review_comments = NULLIF(trim(coalesce(p_comment, '')), ''),
         pi_reviewed_by = auth.uid(),
         pi_reviewed_at = now(),
         -- a rejection sends it back to the vendor; the next submission starts both stages again
         pi_owner_approved_by = CASE WHEN p_approve THEN pi_owner_approved_by ELSE NULL END,
         pi_owner_approved_at = CASE WHEN p_approve THEN pi_owner_approved_at ELSE NULL END
   WHERE id = p_id;
END;
$$;

-- A resubmitted PI starts again at the first stage, as a new submission cycle.
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
  SELECT * INTO r FROM public.vendor_invoices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.doc_stage NOT IN ('proforma_invoice', 'quotation') THEN
    RAISE EXCEPTION 'PI/Quotation not found';
  END IF;
  IF NOT (is_vendor_user(auth.uid()) AND r.vendor_id = get_vendor_id(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF r.pi_approval_stage <> 'rejected' THEN
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
         pi_approval_stage = 'awaiting_owner',
         pi_cycle = r.pi_cycle + 1,
         pi_review_comments = NULL,
         pi_reviewed_by = NULL,
         pi_reviewed_at = NULL,
         pi_owner_approved_by = NULL,
         pi_owner_approved_at = NULL
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
  -- The lock trigger restores the owner fields on every update, so it is
  -- switched off for this one reassignment only.
  ALTER TABLE public.vendor_advance_requests DISABLE TRIGGER trg_lock_decided_advance_request;
  UPDATE public.vendor_advance_requests
     SET project_owner_user_id = v_user,
         project_owner_name = v_name,
         project_owner_email = 'accounts@redefine.in'
   WHERE project_owner_user_id IS NULL
     AND status = 'pending'::public.advance_request_status
     AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE user_id = v_user LIMIT 1);
  ALTER TABLE public.vendor_advance_requests ENABLE TRIGGER trg_lock_decided_advance_request;
END;
$$;

-- A vendor cannot submit a second PI/Quotation with the same document number
-- for the same project while an earlier one is still open or approved (a
-- rejected one may be corrected and sent again). A trigger rather than a unique
-- index, so the two duplicates already in the table are left alone. The advisory
-- lock makes two simultaneous submissions queue instead of both passing.
CREATE OR REPLACE FUNCTION public.block_duplicate_pi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.doc_stage IN ('proforma_invoice', 'quotation')
     AND NULLIF(trim(coalesce(NEW.pi_document_number, '')), '') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext(NEW.vendor_id::text || '|' || coalesce(NEW.rmpl_project_id::text, '') || '|' || lower(trim(NEW.pi_document_number)))
    );
    IF EXISTS (
      SELECT 1 FROM public.vendor_invoices o
       WHERE o.vendor_id = NEW.vendor_id
         AND o.rmpl_project_id IS NOT DISTINCT FROM NEW.rmpl_project_id
         AND o.doc_stage IN ('proforma_invoice', 'quotation')
         AND lower(trim(o.pi_document_number)) = lower(trim(NEW.pi_document_number))
         AND o.status <> 'rejected'::public.invoice_status
    ) THEN
      RAISE EXCEPTION 'This PI/Quotation (%) has already been submitted for this project', NEW.pi_document_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_duplicate_pi ON public.vendor_invoices;
CREATE TRIGGER trg_block_duplicate_pi
  BEFORE INSERT ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.block_duplicate_pi();

-- ============================================================================
-- Vendor PI / Quotation submissions
-- ----------------------------------------------------------------------------
-- Phase 2 of the PI -> Project Owner approval -> PO -> Advance -> Invoice ->
-- Payment flow. The vendor picks one of RMPL's live projects and uploads a
-- Proforma Invoice or Quotation against it. Approval is NOT a generic staff
-- decision — it routes to that specific project's Project Owner, resolved
-- from RMPL's own projects.project_owner and matched into this app's own
-- profiles by email (same pattern as the sibling "expense" app's
-- project_expense_claims / list-rmpl-projects). If RMPL's owner has no
-- matching login here, the submission is rejected outright so nothing goes
-- into an approval queue nobody will ever see.
-- ============================================================================

CREATE TYPE public.pi_quotation_status AS ENUM ('submitted', 'approved', 'rejected');
CREATE TYPE public.pi_quotation_document_type AS ENUM ('proforma_invoice', 'quotation');

CREATE TABLE public.vendor_pi_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  submitted_by UUID,

  document_type public.pi_quotation_document_type NOT NULL,
  file_key TEXT NOT NULL,

  -- RMPL's own project, cached at submission time — no FK possible (RMPL is
  -- a separate Supabase project), so this is a read-only snapshot of what
  -- was picked at filing time.
  rmpl_project_id UUID NOT NULL,
  project_number TEXT,
  project_name TEXT NOT NULL,
  project_owner_external_id UUID,
  project_owner_user_id UUID,
  project_owner_name TEXT,
  project_owner_email TEXT,

  -- AI-extracted fields, same shape as the existing invoice/PI extraction.
  document_date DATE,
  amount NUMERIC(14,2),
  ai_extracted_data JSONB,
  ai_confidence_score NUMERIC,
  ai_model_version TEXT,

  vendor_remarks TEXT,

  status public.pi_quotation_status NOT NULL DEFAULT 'submitted',
  review_comments TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_pi_quotations_tenant_status ON public.vendor_pi_quotations(tenant_id, status);
CREATE INDEX idx_vendor_pi_quotations_vendor ON public.vendor_pi_quotations(vendor_id);
CREATE INDEX idx_vendor_pi_quotations_project_owner ON public.vendor_pi_quotations(project_owner_user_id);

-- ----------------------------------------------------------------------------
-- Force tenant/vendor/submitter consistency and a clean submitted state on
-- insert, same pattern as prepare_vendor_advance_request. Blocks submission
-- outright if the picked project's owner couldn't be matched to a local
-- staff login — an unroutable submission would just sit invisible forever.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_vendor_pi_quotation()
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
  NEW.status := 'submitted'::public.pi_quotation_status;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.review_comments := NULL;

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

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prepare_vendor_pi_quotation
  BEFORE INSERT ON public.vendor_pi_quotations
  FOR EACH ROW EXECUTE FUNCTION public.prepare_vendor_pi_quotation();

-- Once decided, lock what the vendor originally submitted — reviewer UPDATEs
-- may only set status / review_comments / reviewed_by / reviewed_at, and
-- only while still submitted.
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
  NEW.amount := OLD.amount;
  NEW.ai_extracted_data := OLD.ai_extracted_data;
  NEW.ai_confidence_score := OLD.ai_confidence_score;
  NEW.ai_model_version := OLD.ai_model_version;
  NEW.vendor_remarks := OLD.vendor_remarks;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_decided_pi_quotation
  BEFORE UPDATE ON public.vendor_pi_quotations
  FOR EACH ROW EXECUTE FUNCTION public.lock_decided_pi_quotation();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.vendor_pi_quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors view own PI/Quotations"
  ON public.vendor_pi_quotations FOR SELECT TO authenticated
  USING (is_vendor_user(auth.uid()) AND vendor_id = get_vendor_id(auth.uid()));

CREATE POLICY "Vendors submit own PI/Quotations"
  ON public.vendor_pi_quotations FOR INSERT TO authenticated
  WITH CHECK (is_vendor_user(auth.uid()) AND vendor_id = get_vendor_id(auth.uid()));

CREATE POLICY "Staff view PI/Quotations"
  ON public.vendor_pi_quotations FOR SELECT TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- The actual approval action: only the resolved Project Owner may decide,
-- while still submitted. Admins retain override access for fix-ups.
CREATE POLICY "Project owner reviews PI/Quotations"
  ON public.vendor_pi_quotations FOR UPDATE TO authenticated
  USING (
    (project_owner_user_id = auth.uid() AND status = 'submitted'::public.pi_quotation_status)
    OR (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()))
  )
  WITH CHECK (
    (project_owner_user_id = auth.uid() AND tenant_id = get_user_tenant_id(auth.uid()))
    OR (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()))
  );

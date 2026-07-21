-- ============================================================================
-- Vendor advance requests
-- A vendor can ask for an advance against work they've agreed with the client
-- — case by case, no fixed policy. The vendor doesn't necessarily know the
-- org's internal project naming, so they just describe the activity in their
-- own words; a staff member assigns it to the correct internal project at
-- approval time via internal_projects. Approval follows the same pattern as
-- vendor_detail_change_requests: single decision (approve/reject + comment),
-- no separate disbursement step. The actual netting-off happens later,
-- through the existing "Advance Adjusted" field when a payment is recorded
-- against an invoice (vendor_invoice_payments.advance_adjusted) — this table
-- doesn't change that flow, it just tracks the request/approval itself.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.advance_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- A lightweight, per-tenant lookup of internal projects/activities. There's
-- no project-management module in this app — this exists solely so staff
-- have a controlled list to assign an advance request to. Staff can add a
-- new one inline (from the assignment combobox) rather than needing a
-- separate admin screen.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

ALTER TABLE public.internal_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view projects" ON public.internal_projects;
CREATE POLICY "Staff view projects"
  ON public.internal_projects FOR SELECT TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Staff create projects" ON public.internal_projects;
CREATE POLICY "Staff create projects"
  ON public.internal_projects FOR INSERT TO authenticated
  WITH CHECK (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Admins manage projects" ON public.internal_projects;
CREATE POLICY "Admins manage projects"
  ON public.internal_projects FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- ----------------------------------------------------------------------------
-- The advance request itself.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_advance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  requested_by UUID,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  activity_name TEXT NOT NULL,
  vendor_remarks TEXT,
  project_id UUID REFERENCES public.internal_projects(id),
  status public.advance_request_status NOT NULL DEFAULT 'pending',
  review_comments TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_advance_requests_tenant_status
  ON public.vendor_advance_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_advance_requests_vendor
  ON public.vendor_advance_requests(vendor_id);

-- Force tenant/vendor/requester consistency and a clean pending state on
-- insert, same spirit as prepare_vendor_detail_change_request.
CREATE OR REPLACE FUNCTION public.prepare_vendor_advance_request()
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

  IF trim(coalesce(NEW.activity_name, '')) = '' THEN
    RAISE EXCEPTION 'Describe the activity this advance is for';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_vendor_advance_request ON public.vendor_advance_requests;
CREATE TRIGGER trg_prepare_vendor_advance_request
  BEFORE INSERT ON public.vendor_advance_requests
  FOR EACH ROW EXECUTE FUNCTION public.prepare_vendor_advance_request();

ALTER TABLE public.vendor_advance_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors view own advance requests" ON public.vendor_advance_requests;
CREATE POLICY "Vendors view own advance requests"
  ON public.vendor_advance_requests FOR SELECT TO authenticated
  USING (is_vendor_user(auth.uid()) AND vendor_id = get_vendor_id(auth.uid()));

DROP POLICY IF EXISTS "Vendors submit own advance requests" ON public.vendor_advance_requests;
CREATE POLICY "Vendors submit own advance requests"
  ON public.vendor_advance_requests FOR INSERT TO authenticated
  WITH CHECK (is_vendor_user(auth.uid()) AND vendor_id = get_vendor_id(auth.uid()));

DROP POLICY IF EXISTS "Staff view advance requests" ON public.vendor_advance_requests;
CREATE POLICY "Staff view advance requests"
  ON public.vendor_advance_requests FOR SELECT TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Staff review advance requests" ON public.vendor_advance_requests;
CREATE POLICY "Staff review advance requests"
  ON public.vendor_advance_requests FOR UPDATE TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Admins manage advance requests" ON public.vendor_advance_requests;
CREATE POLICY "Admins manage advance requests"
  ON public.vendor_advance_requests FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- Once decided, lock what the vendor originally asked for — staff review
-- UPDATEs may only set project_id / status / review_comments / reviewed_by /
-- reviewed_at, and only while the request is still pending.
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_decided_advance_request ON public.vendor_advance_requests;
CREATE TRIGGER trg_lock_decided_advance_request
  BEFORE UPDATE ON public.vendor_advance_requests
  FOR EACH ROW EXECUTE FUNCTION public.lock_decided_advance_request();

-- ----------------------------------------------------------------------------
-- WhatsApp templates (pending Meta approval via Exotel, same gating pattern
-- as every other WhatsApp notice in this app). Email goes out regardless.
-- ----------------------------------------------------------------------------
INSERT INTO public.whatsapp_templates (template_name, content, variables, category, status, is_active, tenant_id)
SELECT
  'staff_advance_request_submitted_v1',
  'Hi {{1}}, {{2}} has requested an advance of {{3}} for "{{4}}". Please review in the portal.',
  '[
    {"index":1,"description":"Staff recipient name","placeholder":"{{1}}"},
    {"index":2,"description":"Vendor company name","placeholder":"{{2}}"},
    {"index":3,"description":"Requested amount (formatted)","placeholder":"{{3}}"},
    {"index":4,"description":"Activity name the vendor gave","placeholder":"{{4}}"}
  ]'::jsonb,
  'UTILITY',
  'pending',
  false,
  'a0000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates WHERE template_name = 'staff_advance_request_submitted_v1'
);

INSERT INTO public.whatsapp_templates (template_name, content, variables, category, status, is_active, tenant_id)
SELECT
  'vendor_advance_decision_v1',
  'Hi {{1}}, here''s an update on your advance request: {{2}}. Log in to the Vendor Verification Portal for details: https://vendor.in-sync.co.in/vendor/portal',
  '[{"index":1,"description":"Vendor contact name","placeholder":"{{1}}"},{"index":2,"description":"Decision text","placeholder":"{{2}}"}]'::jsonb,
  'UTILITY',
  'pending',
  false,
  'a0000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates WHERE template_name = 'vendor_advance_decision_v1'
);

-- ============================================================================
-- Vendor self-service detail-update requests
-- An approved vendor can request a change to their bank/contact details from
-- the portal; a staff member reviews and, on approval, the real change lands
-- on the vendors row (going through the same encrypt_vendor_pii trigger as
-- any other edit). Nothing changes on the vendor record until staff approve.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.detail_change_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.vendor_detail_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  requested_by UUID,
  requested_contact_name TEXT,
  requested_email TEXT,
  requested_mobile TEXT,
  requested_bank_account_number TEXT,
  requested_bank_ifsc TEXT,
  vendor_note TEXT,
  status public.detail_change_request_status NOT NULL DEFAULT 'pending',
  review_comments TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_detail_change_requests_tenant_status
  ON public.vendor_detail_change_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_detail_change_requests_vendor
  ON public.vendor_detail_change_requests(vendor_id);

-- Force tenant/vendor/requester consistency and require at least one field.
CREATE OR REPLACE FUNCTION public.prepare_vendor_detail_change_request()
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
  NEW.status := 'pending'::public.detail_change_request_status;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.review_comments := NULL;

  IF is_vendor_user(auth.uid()) THEN
    IF v_vendor.current_status <> 'approved'::public.vendor_status THEN
      RAISE EXCEPTION 'Only approved vendors can request detail changes';
    END IF;
    IF NEW.vendor_id <> get_vendor_id(auth.uid()) THEN
      RAISE EXCEPTION 'Cannot request changes for another vendor';
    END IF;
  END IF;

  IF NEW.requested_contact_name IS NULL AND NEW.requested_email IS NULL
     AND NEW.requested_mobile IS NULL AND NEW.requested_bank_account_number IS NULL
     AND NEW.requested_bank_ifsc IS NULL THEN
    RAISE EXCEPTION 'Request at least one field to change';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_vendor_detail_change_request ON public.vendor_detail_change_requests;
CREATE TRIGGER trg_prepare_vendor_detail_change_request
  BEFORE INSERT ON public.vendor_detail_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.prepare_vendor_detail_change_request();

ALTER TABLE public.vendor_detail_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors view own change requests" ON public.vendor_detail_change_requests;
CREATE POLICY "Vendors view own change requests"
  ON public.vendor_detail_change_requests FOR SELECT TO authenticated
  USING (is_vendor_user(auth.uid()) AND vendor_id = get_vendor_id(auth.uid()));

DROP POLICY IF EXISTS "Vendors submit own change requests" ON public.vendor_detail_change_requests;
CREATE POLICY "Vendors submit own change requests"
  ON public.vendor_detail_change_requests FOR INSERT TO authenticated
  WITH CHECK (is_vendor_user(auth.uid()) AND vendor_id = get_vendor_id(auth.uid()));

DROP POLICY IF EXISTS "Staff view change requests" ON public.vendor_detail_change_requests;
CREATE POLICY "Staff view change requests"
  ON public.vendor_detail_change_requests FOR SELECT TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Staff review change requests" ON public.vendor_detail_change_requests;
CREATE POLICY "Staff review change requests"
  ON public.vendor_detail_change_requests FOR UPDATE TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Admins manage change requests" ON public.vendor_detail_change_requests;
CREATE POLICY "Admins manage change requests"
  ON public.vendor_detail_change_requests FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- Lock down which columns a review UPDATE may touch, once a request has
-- already been decided — same spirit as lock_vendor_invoice_fields.
CREATE OR REPLACE FUNCTION public.lock_decided_change_request()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'pending'::public.detail_change_request_status THEN
    RAISE EXCEPTION 'This request has already been reviewed';
  END IF;
  NEW.tenant_id := OLD.tenant_id;
  NEW.vendor_id := OLD.vendor_id;
  NEW.requested_by := OLD.requested_by;
  NEW.requested_contact_name := OLD.requested_contact_name;
  NEW.requested_email := OLD.requested_email;
  NEW.requested_mobile := OLD.requested_mobile;
  NEW.requested_bank_account_number := OLD.requested_bank_account_number;
  NEW.requested_bank_ifsc := OLD.requested_bank_ifsc;
  NEW.vendor_note := OLD.vendor_note;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_decided_change_request ON public.vendor_detail_change_requests;
CREATE TRIGGER trg_lock_decided_change_request
  BEFORE UPDATE ON public.vendor_detail_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.lock_decided_change_request();

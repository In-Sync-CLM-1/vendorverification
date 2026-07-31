-- Vendors can now also request a GST / MSME number correction from the
-- portal's "Update My Details" dialog, alongside contact/bank fields.

ALTER TABLE public.vendor_detail_change_requests
  ADD COLUMN IF NOT EXISTS requested_gst_number TEXT,
  ADD COLUMN IF NOT EXISTS requested_msme_number TEXT;

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
     AND NEW.requested_bank_ifsc IS NULL AND NEW.requested_gst_number IS NULL
     AND NEW.requested_msme_number IS NULL THEN
    RAISE EXCEPTION 'Request at least one field to change';
  END IF;

  RETURN NEW;
END;
$$;

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
  NEW.requested_gst_number := OLD.requested_gst_number;
  NEW.requested_msme_number := OLD.requested_msme_number;
  NEW.vendor_note := OLD.vendor_note;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- Adhoc invoice upload — purchases from a vendor who isn't verified
-- ----------------------------------------------------------------------------
-- Every existing invoice path (vendor self-submit, Livecom-on-behalf-of) requires
-- vendors.current_status = 'approved'. Some purchases (one-off/local/emergency
-- buys) will never have a verified vendor record behind them. This adds a
-- narrow, separate path — restricted to the 'adhoc_invoice_uploader' role —
-- that records the same invoice details but with a free-text vendor name
-- instead of a vendors row, and is clearly flagged as unverified everywhere
-- it's displayed.
--
-- The invoice still goes through the exact same staff review queue
-- (StaffInvoices.tsx) and payment recording (advance/GST/TDS/payout) as a
-- normal invoice — nothing here auto-approves it.
-- ============================================================================

ALTER TABLE public.vendor_invoices
  ALTER COLUMN vendor_id DROP NOT NULL;

ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS is_adhoc BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adhoc_vendor_name TEXT,
  ADD COLUMN IF NOT EXISTS adhoc_vendor_contact TEXT;

ALTER TABLE public.vendor_invoices
  ADD CONSTRAINT vendor_invoices_adhoc_shape CHECK (
    (is_adhoc = false AND vendor_id IS NOT NULL AND adhoc_vendor_name IS NULL)
    OR
    (is_adhoc = true AND vendor_id IS NULL AND adhoc_vendor_name IS NOT NULL)
  );

ALTER TYPE public.invoice_submission_source ADD VALUE IF NOT EXISTS 'adhoc_upload';

-- ----------------------------------------------------------------------------
-- prepare_vendor_invoice() already runs on every insert. Extend it with an
-- adhoc branch instead of touching the existing (vendor_id IS NOT NULL) path.
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
  IF NEW.is_adhoc THEN
    NEW.tenant_id := public.get_user_tenant_id(auth.uid());
    NEW.submitted_by := COALESCE(NEW.submitted_by, auth.uid());
    RETURN NEW;
  END IF;

  SELECT v.tenant_id, v.current_status INTO v_vendor
  FROM public.vendors v WHERE v.id = NEW.vendor_id;

  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  NEW.tenant_id := v_vendor.tenant_id;
  NEW.submitted_by := COALESCE(NEW.submitted_by, auth.uid());

  IF is_vendor_user(auth.uid()) THEN
    IF v_vendor.current_status <> 'approved'::public.vendor_status THEN
      RAISE EXCEPTION 'Only approved vendors can submit invoices';
    END IF;
    NEW.status := 'submitted'::public.invoice_status;
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- submit_adhoc_invoice: the only way an adhoc row gets created — keeps the
-- role check and the invoice-vs-vendor shape (is_adhoc/vendor_id/name) in one
-- place rather than relying on a raw RLS INSERT policy, same reasoning as
-- submit_livecom_invoice().
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_adhoc_invoice(
  p_adhoc_vendor_name TEXT,
  p_adhoc_vendor_contact TEXT,
  p_invoice_number TEXT,
  p_invoice_date DATE,
  p_invoice_amount NUMERIC,
  p_gst_amount NUMERIC,
  p_description TEXT,
  p_po_number TEXT,
  p_invoice_file_key TEXT,
  p_po_file_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'adhoc_invoice_uploader'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorised to upload an adhoc invoice';
  END IF;

  IF p_adhoc_vendor_name IS NULL OR trim(p_adhoc_vendor_name) = '' THEN
    RAISE EXCEPTION 'Enter the vendor name';
  END IF;

  IF p_invoice_amount IS NULL OR p_invoice_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid invoice amount';
  END IF;

  INSERT INTO public.vendor_invoices (
    tenant_id, vendor_id, is_adhoc, adhoc_vendor_name, adhoc_vendor_contact,
    invoice_number, invoice_date, invoice_amount, gst_amount,
    description, po_number, po_file_key, invoice_file_key, status,
    submitted_by, submission_source
  ) VALUES (
    public.get_user_tenant_id(auth.uid()), NULL, true,
    trim(p_adhoc_vendor_name), NULLIF(trim(COALESCE(p_adhoc_vendor_contact, '')), ''),
    trim(p_invoice_number), p_invoice_date, p_invoice_amount, COALESCE(p_gst_amount, 0),
    NULLIF(trim(COALESCE(p_description, '')), ''), NULLIF(trim(COALESCE(p_po_number, '')), ''),
    p_po_file_key, p_invoice_file_key, 'submitted'::public.invoice_status,
    auth.uid(), 'adhoc_upload'::public.invoice_submission_source
  )
  RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_adhoc_invoice(TEXT, TEXT, TEXT, DATE, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_adhoc_invoice(TEXT, TEXT, TEXT, DATE, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;

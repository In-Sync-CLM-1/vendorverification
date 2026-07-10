-- ============================================================================
-- Vendor Invoice Portal
-- Approved vendors log in with OTP (registered email / WhatsApp number),
-- upload invoices (+ optional PO) and see payment details recorded by staff
-- with an advance / GST / TDS / actual-payout breakup.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Email-based vendor logins have no phone number
-- ----------------------------------------------------------------------------
ALTER TABLE public.vendor_users ALTER COLUMN phone_number DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Contact lookup that works against encrypted PII columns.
--    The plaintext primary_email / primary_mobile are masked after the
--    encryption trigger runs, so equality against them never matches.
--    service_role only — decrypts PII, must not be callable from clients.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_vendor_by_contact(p_identifier TEXT)
RETURNS TABLE (
  vendor_id UUID,
  tenant_id UUID,
  current_status public.vendor_status,
  company_name TEXT,
  vendor_code TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_email BOOLEAN := position('@' IN p_identifier) > 0;
  v_email TEXT := lower(trim(p_identifier));
  v_digits TEXT := RIGHT(regexp_replace(p_identifier, '\D', '', 'g'), 10);
BEGIN
  RETURN QUERY
  SELECT v.id, v.tenant_id, v.current_status, v.company_name, v.vendor_code
  FROM public.vendors v
  WHERE
    CASE WHEN v_is_email THEN
      lower(trim(COALESCE(decrypt_pii(v.primary_email_encrypted), v.primary_email))) = v_email
    ELSE
      length(v_digits) = 10
      AND RIGHT(regexp_replace(COALESCE(decrypt_pii(v.primary_mobile_encrypted), v.primary_mobile), '\D', '', 'g'), 10) = v_digits
    END
  ORDER BY (v.current_status = 'approved'::public.vendor_status) DESC, v.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_vendor_by_contact(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_vendor_by_contact(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.find_vendor_by_contact(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_vendor_by_contact(TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 2b. Stop the PII trigger destroying contacts on row updates.
--     primary_mobile / primary_email keep a MASKED value in plaintext after
--     encryption ('****1234' / 'user@***'). On any later UPDATE (approval,
--     edits) the trigger re-encrypted that masked value over the real one —
--     25 of 29 approved vendors have lost their contact data this way.
--     Guard: never (re-)encrypt a value that is already a mask.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.encrypt_vendor_pii()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.pan_number IS NOT NULL AND NEW.pan_number != '' THEN
    NEW.pan_number_encrypted := encrypt_pii(NEW.pan_number);
    NEW.pan_number := NULL;
  END IF;
  IF NEW.gst_number IS NOT NULL AND NEW.gst_number != '' THEN
    NEW.gst_number_encrypted := encrypt_pii(NEW.gst_number);
    NEW.gst_number := NULL;
  END IF;
  IF NEW.cin_number IS NOT NULL AND NEW.cin_number != '' THEN
    NEW.cin_number_encrypted := encrypt_pii(NEW.cin_number);
    NEW.cin_number := NULL;
  END IF;
  IF NEW.bank_account_number IS NOT NULL AND NEW.bank_account_number != '' THEN
    NEW.bank_account_number_encrypted := encrypt_pii(NEW.bank_account_number);
    NEW.bank_account_number := NULL;
  END IF;
  IF NEW.bank_ifsc IS NOT NULL AND NEW.bank_ifsc != '' THEN
    NEW.bank_ifsc_encrypted := encrypt_pii(NEW.bank_ifsc);
    NEW.bank_ifsc := NULL;
  END IF;
  IF NEW.primary_mobile IS NOT NULL AND NEW.primary_mobile != ''
     AND NEW.primary_mobile NOT LIKE '****%' THEN
    NEW.primary_mobile_encrypted := encrypt_pii(NEW.primary_mobile);
    NEW.primary_mobile := '****' || RIGHT(NEW.primary_mobile, 4);
  END IF;
  IF NEW.primary_email IS NOT NULL AND NEW.primary_email != ''
     AND NEW.primary_email NOT LIKE '%@***' THEN
    NEW.primary_email_encrypted := encrypt_pii(NEW.primary_email);
    NEW.primary_email := SPLIT_PART(NEW.primary_email, '@', 1) || '@***';
  END IF;
  IF NEW.secondary_mobile IS NOT NULL AND NEW.secondary_mobile != '' THEN
    NEW.secondary_mobile_encrypted := encrypt_pii(NEW.secondary_mobile);
    NEW.secondary_mobile := NULL;
  END IF;
  IF NEW.nominee_contact IS NOT NULL AND NEW.nominee_contact != '' THEN
    NEW.nominee_contact_encrypted := encrypt_pii(NEW.nominee_contact);
    NEW.nominee_contact := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Invoice status lifecycle
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM
    ('submitted', 'under_review', 'approved', 'rejected', 'partially_paid', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Invoices
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  invoice_amount NUMERIC(14,2) NOT NULL CHECK (invoice_amount > 0),
  gst_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  description TEXT,
  po_number TEXT,
  po_file_key TEXT,
  invoice_file_key TEXT NOT NULL,
  status public.invoice_status NOT NULL DEFAULT 'submitted',
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  submitted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vendor_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_tenant_status ON public.vendor_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_vendor ON public.vendor_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_created ON public.vendor_invoices(created_at DESC);

DROP TRIGGER IF EXISTS trg_vendor_invoices_updated_at ON public.vendor_invoices;
CREATE TRIGGER trg_vendor_invoices_updated_at
  BEFORE UPDATE ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Force tenant/vendor consistency and stamp the submitter; a vendor user can
-- only file invoices for their own approved vendor.
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

  IF is_vendor_user(auth.uid()) THEN
    IF v_vendor.current_status <> 'approved'::public.vendor_status THEN
      RAISE EXCEPTION 'Only approved vendors can submit invoices';
    END IF;
    NEW.status := 'submitted'::public.invoice_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_vendor_invoice ON public.vendor_invoices;
CREATE TRIGGER trg_prepare_vendor_invoice
  BEFORE INSERT ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.prepare_vendor_invoice();

-- ----------------------------------------------------------------------------
-- 5. Payments (multiple per invoice), with the settlement breakup:
--    advance adjusted + GST + TDS + actual payout
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  invoice_id UUID NOT NULL REFERENCES public.vendor_invoices(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  advance_adjusted NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (advance_adjusted >= 0),
  gst_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  tds_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tds_amount >= 0),
  payout_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (payout_amount >= 0),
  total_settled NUMERIC(14,2) GENERATED ALWAYS AS (advance_adjusted + tds_amount + payout_amount) STORED,
  utr_reference TEXT,
  remarks TEXT,
  is_full_settlement BOOLEAN NOT NULL DEFAULT false,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_invoice_payments_invoice ON public.vendor_invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_payments_tenant ON public.vendor_invoice_payments(tenant_id);

-- Derive tenant/vendor from the invoice, gate on invoice state, stamp recorder,
-- and roll the invoice status forward (partially_paid / paid) after insert.
CREATE OR REPLACE FUNCTION public.prepare_invoice_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
BEGIN
  SELECT i.tenant_id, i.vendor_id, i.status INTO v_inv
  FROM public.vendor_invoices i WHERE i.id = NEW.invoice_id;

  IF v_inv IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.status NOT IN ('approved'::public.invoice_status, 'partially_paid'::public.invoice_status) THEN
    RAISE EXCEPTION 'Payments can only be recorded against approved invoices';
  END IF;

  NEW.tenant_id := v_inv.tenant_id;
  NEW.vendor_id := v_inv.vendor_id;
  NEW.recorded_by := COALESCE(NEW.recorded_by, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_invoice_payment ON public.vendor_invoice_payments;
CREATE TRIGGER trg_prepare_invoice_payment
  BEFORE INSERT ON public.vendor_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.prepare_invoice_payment();

CREATE OR REPLACE FUNCTION public.apply_invoice_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_amount NUMERIC;
  v_full BOOLEAN;
BEGIN
  SELECT COALESCE(SUM(p.total_settled), 0), BOOL_OR(p.is_full_settlement)
    INTO v_total, v_full
  FROM public.vendor_invoice_payments p
  WHERE p.invoice_id = NEW.invoice_id;

  SELECT i.invoice_amount INTO v_amount
  FROM public.vendor_invoices i WHERE i.id = NEW.invoice_id;

  UPDATE public.vendor_invoices
  SET status = CASE
      WHEN v_full OR v_total >= v_amount THEN 'paid'::public.invoice_status
      ELSE 'partially_paid'::public.invoice_status
    END
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_invoice_payment ON public.vendor_invoice_payments;
CREATE TRIGGER trg_apply_invoice_payment
  AFTER INSERT ON public.vendor_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_invoice_payment();

-- ----------------------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.vendor_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view invoices" ON public.vendor_invoices;
CREATE POLICY "Staff view invoices"
  ON public.vendor_invoices FOR SELECT TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Staff update invoices" ON public.vendor_invoices;
CREATE POLICY "Staff update invoices"
  ON public.vendor_invoices FOR UPDATE TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Admins manage invoices" ON public.vendor_invoices;
CREATE POLICY "Admins manage invoices"
  ON public.vendor_invoices FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Vendors view own invoices" ON public.vendor_invoices;
CREATE POLICY "Vendors view own invoices"
  ON public.vendor_invoices FOR SELECT TO authenticated
  USING (is_vendor_user(auth.uid()) AND vendor_id = get_vendor_id(auth.uid()));

DROP POLICY IF EXISTS "Vendors submit own invoices" ON public.vendor_invoices;
CREATE POLICY "Vendors submit own invoices"
  ON public.vendor_invoices FOR INSERT TO authenticated
  WITH CHECK (is_vendor_user(auth.uid()) AND vendor_id = get_vendor_id(auth.uid()));

DROP POLICY IF EXISTS "Staff view payments" ON public.vendor_invoice_payments;
CREATE POLICY "Staff view payments"
  ON public.vendor_invoice_payments FOR SELECT TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Staff record payments" ON public.vendor_invoice_payments;
CREATE POLICY "Staff record payments"
  ON public.vendor_invoice_payments FOR INSERT TO authenticated
  WITH CHECK (
    is_internal_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.vendor_invoices i
      WHERE i.id = invoice_id AND i.tenant_id = get_user_tenant_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins manage payments" ON public.vendor_invoice_payments;
CREATE POLICY "Admins manage payments"
  ON public.vendor_invoice_payments FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Vendors view own payments" ON public.vendor_invoice_payments;
CREATE POLICY "Vendors view own payments"
  ON public.vendor_invoice_payments FOR SELECT TO authenticated
  USING (is_vendor_user(auth.uid()) AND vendor_id = get_vendor_id(auth.uid()));

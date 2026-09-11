-- ============================================================================
-- Purchase Orders — PI -> Project Owner approval -> PO -> Invoice, the next
-- phase called out in 20260807190000_vendor_pi_quotations.sql's own comment.
--
-- Accounts issues a PO against an approved PI/Quotation (one click from the
-- PI/Quotation Approvals page). From here, a vendor may not submit an
-- invoice at all unless they hold at least one issued, not-yet-consumed PO —
-- enforced in prepare_vendor_invoice below, not just hidden in the UI.
-- ============================================================================

-- Redefine Marcom's own billing identity, needed to print the PO's "Billing
-- Address" (issuer) block. Nullable/generic on every other tenant — set only
-- where known, same pattern as 20260730100000's tenant_email_sender UPDATE.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS pan TEXT,
  ADD COLUMN IF NOT EXISTS cin TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

UPDATE public.tenants SET
  billing_address = '2nd Floor, House No CB-390, Ring Road Colony, Naraina, New Delhi, Delhi, 110028',
  gstin = '07AAECR3805M1Z7',
  pan = 'AAECR3805M',
  cin = 'U74999DL2009PTC190842',
  contact_email = 'info@redefine.in',
  contact_phone = '+91 9818275553'
WHERE name = 'REDEFINE MARCOM PRIVATE LIMITED' AND gstin IS NULL;

CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,

  -- Exactly one of these is set: the PI it was issued against, until that PI
  -- is settled into an invoice, at which point settle_pi_into_invoice
  -- re-points this row at the invoice instead (mirrors how a payment's
  -- pi_quotation_id/invoice_id gets re-pointed in 20260813170000).
  pi_quotation_id UUID REFERENCES public.vendor_pi_quotations(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.vendor_invoices(id) ON DELETE SET NULL,
  CONSTRAINT purchase_orders_one_parent CHECK (num_nonnulls(pi_quotation_id, invoice_id) = 1),

  po_number TEXT NOT NULL,
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Frozen at issuance -- a PO is a point-in-time legal document, its
  -- printed content must not drift if the vendor's or tenant's live details
  -- change later (same reasoning as crm's billing seller_snapshot).
  vendor_name TEXT NOT NULL,
  vendor_address TEXT,
  vendor_gstin TEXT,
  vendor_pan TEXT,
  issuer_name TEXT NOT NULL,
  issuer_address TEXT,
  issuer_gstin TEXT,

  project_number TEXT,
  project_name TEXT NOT NULL,
  place_of_supply TEXT NOT NULL,

  description TEXT NOT NULL,
  hsn_sac TEXT,
  taxable_amount NUMERIC(14,2) NOT NULL CHECK (taxable_amount > 0),
  tax_type TEXT NOT NULL DEFAULT 'igst' CHECK (tax_type IN ('igst', 'cgst_sgst', 'none')),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 18,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL CHECK (grand_total > 0),

  pdf_file_key TEXT,

  issued_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One PO per PI -- issuing again is blocked outright, matching "a button
-- click on an approved PI" being a single, non-repeatable action.
CREATE UNIQUE INDEX idx_purchase_orders_pi ON public.purchase_orders(pi_quotation_id) WHERE pi_quotation_id IS NOT NULL;
CREATE UNIQUE INDEX idx_purchase_orders_number ON public.purchase_orders(tenant_id, po_number);
CREATE INDEX idx_purchase_orders_vendor ON public.purchase_orders(vendor_id);
CREATE INDEX idx_purchase_orders_invoice ON public.purchase_orders(invoice_id);

-- ----------------------------------------------------------------------------
-- PO numbering: "<running-number>/<FY>", e.g. 179/2026-27. Indian fiscal
-- year (Apr-Mar), running number resets per tenant per FY. Same MAX+1
-- pattern this app already uses for vendor_code (generate_vendor_code) --
-- adequate at this app's real issuance volume (a handful of POs a day at
-- most), not a high-concurrency ticketing system.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy_start INT;
  v_fy_label TEXT;
  v_seq INT;
BEGIN
  IF NEW.po_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_fy_start := CASE WHEN EXTRACT(MONTH FROM NEW.po_date) >= 4
    THEN EXTRACT(YEAR FROM NEW.po_date)::INT
    ELSE EXTRACT(YEAR FROM NEW.po_date)::INT - 1
  END;
  v_fy_label := v_fy_start::TEXT || '-' || LPAD(((v_fy_start + 1) % 100)::TEXT, 2, '0');

  SELECT COALESCE(MAX(CAST(SPLIT_PART(po_number, '/', 1) AS INTEGER)), 0) + 1
  INTO v_seq
  FROM public.purchase_orders
  WHERE tenant_id = NEW.tenant_id AND po_number LIKE '%/' || v_fy_label;

  NEW.po_number := v_seq::TEXT || '/' || v_fy_label;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_po_number
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW WHEN (NEW.po_number IS NULL)
  EXECUTE FUNCTION public.generate_po_number();

-- ----------------------------------------------------------------------------
-- issue_purchase_order: the one-click action from PI/Quotation Approvals.
-- Only Accounts/Admin of the PI's own tenant may call it, only against an
-- approved PI with no PO yet. Vendor/issuer identity is snapshotted here,
-- not read live at print time.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_purchase_order(
  p_pi_quotation_id UUID,
  p_description TEXT,
  p_hsn_sac TEXT,
  p_place_of_supply TEXT,
  p_taxable_amount NUMERIC,
  p_tax_type TEXT,
  p_tax_rate NUMERIC,
  p_po_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pi public.vendor_pi_quotations%ROWTYPE;
  v_vendor public.vendors%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_tax_amount NUMERIC;
  v_po public.purchase_orders;
BEGIN
  SELECT * INTO v_pi FROM public.vendor_pi_quotations WHERE id = p_pi_quotation_id;
  IF v_pi IS NULL THEN
    RAISE EXCEPTION 'PI/Quotation not found';
  END IF;

  IF NOT (is_internal_staff(auth.uid()) AND get_user_tenant_id(auth.uid()) = v_pi.tenant_id
          AND (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('accounts', 'admin', 'platform_admin')))) THEN
    RAISE EXCEPTION 'Only Accounts/Admin may issue a Purchase Order';
  END IF;

  IF v_pi.status <> 'approved'::public.pi_quotation_status THEN
    RAISE EXCEPTION 'A Purchase Order can only be issued against an approved PI/Quotation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE pi_quotation_id = p_pi_quotation_id) THEN
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

  SELECT * INTO v_vendor FROM public.vendors WHERE id = v_pi.vendor_id;
  SELECT * INTO v_tenant FROM public.tenants WHERE id = v_pi.tenant_id;

  v_tax_amount := CASE WHEN p_tax_type = 'none' THEN 0 ELSE ROUND(p_taxable_amount * p_tax_rate / 100, 2) END;

  INSERT INTO public.purchase_orders (
    tenant_id, vendor_id, pi_quotation_id, po_date,
    vendor_name, vendor_address, vendor_gstin, vendor_pan,
    issuer_name, issuer_address, issuer_gstin,
    project_number, project_name, place_of_supply,
    description, hsn_sac, taxable_amount, tax_type, tax_rate, tax_amount, grand_total,
    issued_by
  ) VALUES (
    v_pi.tenant_id, v_pi.vendor_id, p_pi_quotation_id, p_po_date,
    v_vendor.company_name, coalesce(v_vendor.operational_address, v_vendor.registered_address), v_vendor.gst_number, v_vendor.pan_number,
    v_tenant.name, v_tenant.billing_address, v_tenant.gstin,
    v_pi.project_number, v_pi.project_name, p_place_of_supply,
    p_description, p_hsn_sac, p_taxable_amount, p_tax_type, p_tax_rate, v_tax_amount, p_taxable_amount + v_tax_amount,
    auth.uid()
  ) RETURNING * INTO v_po;

  RETURN v_po;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_purchase_order(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_purchase_order(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, DATE) TO authenticated, service_role;

-- Attach the generated PDF after upload (issue_purchase_order can't do this
-- itself -- the file is rendered and uploaded client-side, after the row
-- already exists and its number is known).
CREATE OR REPLACE FUNCTION public.attach_purchase_order_pdf(p_po_id UUID, p_pdf_file_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.purchase_orders po
     SET pdf_file_key = p_pdf_file_key
   WHERE po.id = p_po_id
     AND is_internal_staff(auth.uid())
     AND get_user_tenant_id(auth.uid()) = po.tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_purchase_order_pdf(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_purchase_order_pdf(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors view own purchase orders"
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (is_vendor_user(auth.uid()) AND vendor_id = get_vendor_id(auth.uid()));

CREATE POLICY "Staff view purchase orders"
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- No direct INSERT/UPDATE/DELETE policy for anyone -- every write goes
-- through the two SECURITY DEFINER functions above, which hold their own
-- role checks. Nothing else should ever create or edit a PO.

-- ----------------------------------------------------------------------------
-- settle_pi_into_invoice: also re-point a PI's PO at the resulting invoice,
-- same pattern as the payments re-point already in this function.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_pi_into_invoice(
  p_invoice_id UUID,
  p_pi_quotation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pi public.vendor_pi_quotations%ROWTYPE;
  v_invoice public.vendor_invoices%ROWTYPE;
  v_moved INT;
BEGIN
  SELECT * INTO v_invoice FROM public.vendor_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT * INTO v_pi FROM public.vendor_pi_quotations WHERE id = p_pi_quotation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PI/Quotation not found';
  END IF;

  IF v_pi.vendor_id <> v_invoice.vendor_id THEN
    RAISE EXCEPTION 'This document belongs to a different vendor';
  END IF;

  IF NOT (
    public.get_vendor_id(auth.uid()) = v_invoice.vendor_id
    OR (public.is_internal_staff(auth.uid()) AND public.get_user_tenant_id(auth.uid()) = v_invoice.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised for this invoice';
  END IF;

  IF v_pi.status = 'rejected' THEN
    RAISE EXCEPTION 'A rejected PI/Quotation cannot be settled against an invoice';
  END IF;

  UPDATE public.vendor_invoices
     SET rmpl_project_id       = v_pi.rmpl_project_id,
         project_number        = v_pi.project_number,
         project_name          = v_pi.project_name,
         project_owner_user_id = v_pi.project_owner_user_id,
         project_owner_name    = v_pi.project_owner_name,
         project_owner_email   = v_pi.project_owner_email
   WHERE id = p_invoice_id;

  UPDATE public.vendor_invoice_payments
     SET invoice_id = p_invoice_id,
         pi_quotation_id = NULL
   WHERE pi_quotation_id = p_pi_quotation_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- Carry the PO across with the PI it was issued against, rather than
  -- losing the link when the PI row is deleted below.
  UPDATE public.purchase_orders
     SET invoice_id = p_invoice_id,
         pi_quotation_id = NULL
   WHERE pi_quotation_id = p_pi_quotation_id;

  DELETE FROM public.vendor_pi_quotations WHERE id = p_pi_quotation_id;

  IF v_moved > 0 THEN
    UPDATE public.vendor_invoices i
       SET status = CASE
             WHEN t.full_settlement OR t.total >= i.invoice_amount THEN 'paid'::public.invoice_status
             ELSE 'partially_paid'::public.invoice_status
           END
      FROM (
        SELECT COALESCE(SUM(total_settled), 0) AS total,
               COALESCE(BOOL_OR(is_full_settlement), false) AS full_settlement
          FROM public.vendor_invoice_payments
         WHERE invoice_id = p_invoice_id
      ) t
     WHERE i.id = p_invoice_id
       AND i.status IN ('approved'::public.invoice_status, 'partially_paid'::public.invoice_status);
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- prepare_vendor_invoice: hard gate. A vendor with zero issued, unconsumed
-- Purchase Orders cannot insert an invoice row at all -- this is enforced
-- here, not just by hiding the option in InvoiceUploadDialog, so no client
-- path can route around it.
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

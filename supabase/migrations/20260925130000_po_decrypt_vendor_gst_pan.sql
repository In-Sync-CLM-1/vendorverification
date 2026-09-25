-- issue_purchase_order was reading vendor GST/PAN straight off public.vendors,
-- whose gst_number/pan_number columns are nulled out by encrypt_vendor_pii
-- (real value lives in gst_number_encrypted/pan_number_encrypted, see
-- 20260720120000). Every issued PO has therefore always printed a blank
-- vendor GSTIN and PAN even when the vendor has real ones on file. Fix: read
-- through the same decrypt_pii(...) COALESCE pattern vendors_decrypted and
-- get_vendor_sensitive_info already use.

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
  v_vendor_name TEXT;
  v_vendor_address TEXT;
  v_vendor_gstin TEXT;
  v_vendor_pan TEXT;
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

  SELECT v.company_name,
         coalesce(v.operational_address, v.registered_address),
         coalesce(decrypt_pii(v.gst_number_encrypted), v.gst_number),
         coalesce(decrypt_pii(v.pan_number_encrypted), v.pan_number)
    INTO v_vendor_name, v_vendor_address, v_vendor_gstin, v_vendor_pan
  FROM public.vendors v WHERE v.id = v_pi.vendor_id;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = v_pi.tenant_id;

  v_tax_amount := CASE WHEN p_tax_type = 'none' THEN 0 ELSE ROUND(p_taxable_amount * p_tax_rate / 100, 2) END;

  INSERT INTO public.purchase_orders (
    tenant_id, vendor_id, pi_quotation_id, po_date,
    vendor_name, vendor_address, vendor_gstin, vendor_pan,
    issuer_name, issuer_address, issuer_gstin,
    project_number, project_name, project_manager, place_of_supply,
    description, hsn_sac, taxable_amount, tax_type, tax_rate, tax_amount, grand_total,
    issued_by
  ) VALUES (
    v_pi.tenant_id, v_pi.vendor_id, p_pi_quotation_id, p_po_date,
    v_vendor_name, v_vendor_address, v_vendor_gstin, v_vendor_pan,
    v_tenant.name, v_tenant.billing_address, v_tenant.gstin,
    v_pi.project_number, v_pi.project_name, v_pi.project_owner_name, p_place_of_supply,
    p_description, p_hsn_sac, p_taxable_amount, p_tax_type, p_tax_rate, v_tax_amount, p_taxable_amount + v_tax_amount,
    auth.uid()
  ) RETURNING * INTO v_po;

  RETURN v_po;
END;
$$;

-- Backfill the one PO already issued live before this fix, so its printed
-- record matches what the vendor actually has on file.
UPDATE public.purchase_orders po SET
  vendor_gstin = coalesce(po.vendor_gstin, (SELECT decrypt_pii(v.gst_number_encrypted) FROM public.vendors v WHERE v.id = po.vendor_id)),
  vendor_pan   = coalesce(po.vendor_pan, (SELECT decrypt_pii(v.pan_number_encrypted) FROM public.vendors v WHERE v.id = po.vendor_id)),
  project_manager = coalesce(po.project_manager, (SELECT i.project_owner_name FROM public.vendor_invoices i WHERE i.id = po.invoice_id))
WHERE po.vendor_gstin IS NULL OR po.vendor_pan IS NULL OR po.project_manager IS NULL;

-- An invoice and the PI/Quotation it was raised against are the same piece of
-- work. Leaving both open bills it twice over, so raising the invoice settles
-- the PI: the PI's project and approval details move onto the invoice and the
-- PI itself is removed.
--
-- The PI is deleted outright; its project and approver carry across so the
-- invoice still records who authorised the work.

ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS rmpl_project_id UUID,
  ADD COLUMN IF NOT EXISTS project_number TEXT,
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS project_owner_user_id UUID,
  ADD COLUMN IF NOT EXISTS project_owner_name TEXT,
  ADD COLUMN IF NOT EXISTS project_owner_email TEXT;

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
BEGIN
  SELECT * INTO v_invoice FROM public.vendor_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT * INTO v_pi FROM public.vendor_pi_quotations WHERE id = p_pi_quotation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PI/Quotation not found';
  END IF;

  -- Both must belong to the same vendor, and the caller must be that vendor or
  -- staff of the tenant. SECURITY DEFINER bypasses RLS, so this is the gate.
  IF v_pi.vendor_id <> v_invoice.vendor_id THEN
    RAISE EXCEPTION 'This document belongs to a different vendor';
  END IF;

  IF NOT (
    public.get_vendor_id(auth.uid()) = v_invoice.vendor_id
    OR (public.is_internal_staff(auth.uid()) AND public.get_user_tenant_id(auth.uid()) = v_invoice.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised for this invoice';
  END IF;

  -- A rejected PI was never authorised, so it cannot settle anything.
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

  DELETE FROM public.vendor_pi_quotations WHERE id = p_pi_quotation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_pi_into_invoice(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_pi_into_invoice(UUID, UUID) TO authenticated, service_role;

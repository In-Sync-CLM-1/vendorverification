-- Settlement accepted any two documents belonging to the same vendor, so an
-- invoice could be settled against a PI for a completely different amount —
-- billing more than was ever approved, with the PI deleted and no trace left.
--
-- An invoice may be raised for part of a PI (staged billing), so it may be
-- smaller. It may never be larger than the amount that was approved.

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

  -- The amounts must be reconcilable. Rounding noise is tolerated; billing
  -- above the approved amount is not.
  IF v_pi.amount IS NOT NULL
     AND v_invoice.invoice_amount IS NOT NULL
     AND v_invoice.invoice_amount > v_pi.amount + 1 THEN
    RAISE EXCEPTION
      'Invoice of % cannot be settled against a PI/Quotation of % — the invoice exceeds the approved amount',
      to_char(v_invoice.invoice_amount, 'FM999,999,999.00'),
      to_char(v_pi.amount, 'FM999,999,999.00');
  END IF;

  UPDATE public.vendor_invoices
     SET rmpl_project_id       = v_pi.rmpl_project_id,
         project_number        = v_pi.project_number,
         project_name          = v_pi.project_name,
         project_owner_user_id = v_pi.project_owner_user_id,
         project_owner_name    = v_pi.project_owner_name,
         project_owner_email   = v_pi.project_owner_email
   WHERE id = p_invoice_id;

  -- Move the money before deleting the PI — the FK cascades, so payments left
  -- behind would be destroyed with it.
  UPDATE public.vendor_invoice_payments
     SET invoice_id = p_invoice_id,
         pi_quotation_id = NULL
   WHERE pi_quotation_id = p_pi_quotation_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  DELETE FROM public.vendor_pi_quotations WHERE id = p_pi_quotation_id;

  IF v_moved > 0 THEN
    PERFORM public.refresh_invoice_payment_status(p_invoice_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_pi_into_invoice(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_pi_into_invoice(UUID, UUID) TO authenticated, service_role;

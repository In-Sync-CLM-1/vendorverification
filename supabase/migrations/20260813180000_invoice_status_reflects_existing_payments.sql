-- An invoice can now hold payments it never received itself: settling a PI
-- moves that money across. The status roll-up only ran when a payment was
-- inserted, so such an invoice sat at 'submitted' while fully paid.
--
-- Two gaps closed:
--   1. Settlement sets the status from the payments it inherits, whatever the
--      invoice's current status — the money is already out of the door, the
--      approval gate on *recording* a payment does not apply retrospectively.
--   2. Approving an invoice that already carries payments recomputes it, so it
--      does not land on 'approved' while fully settled.

CREATE OR REPLACE FUNCTION public.refresh_invoice_payment_status(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_full BOOLEAN;
  v_amount NUMERIC;
BEGIN
  SELECT COALESCE(SUM(total_settled), 0), COALESCE(BOOL_OR(is_full_settlement), false)
    INTO v_total, v_full
    FROM public.vendor_invoice_payments
   WHERE invoice_id = p_invoice_id;

  IF v_total <= 0 THEN
    RETURN;
  END IF;

  SELECT invoice_amount INTO v_amount FROM public.vendor_invoices WHERE id = p_invoice_id;

  UPDATE public.vendor_invoices
     SET status = CASE
           WHEN v_full OR v_total >= v_amount THEN 'paid'::public.invoice_status
           ELSE 'partially_paid'::public.invoice_status
         END
   WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_invoice_status_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'::public.invoice_status
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.refresh_invoice_payment_status(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_status_on_approval ON public.vendor_invoices;
CREATE TRIGGER trg_sync_invoice_status_on_approval
  AFTER UPDATE OF status ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_status_on_approval();

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

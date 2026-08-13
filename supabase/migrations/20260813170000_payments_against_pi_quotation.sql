-- Payments could only ever attach to an invoice. A PI/Quotation that has been
-- approved and part-paid therefore had nowhere to record that money, and when
-- the invoice replaced the PI the payment history had nothing to move across.
--
-- A payment now hangs off exactly one of the two documents, and settling a PI
-- into an invoice re-points its payments at the invoice.

ALTER TABLE public.vendor_invoice_payments
  ALTER COLUMN invoice_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS pi_quotation_id UUID
    REFERENCES public.vendor_pi_quotations(id) ON DELETE CASCADE;

ALTER TABLE public.vendor_invoice_payments
  DROP CONSTRAINT IF EXISTS vendor_invoice_payments_one_parent;
ALTER TABLE public.vendor_invoice_payments
  ADD CONSTRAINT vendor_invoice_payments_one_parent
  CHECK (num_nonnulls(invoice_id, pi_quotation_id) = 1);

CREATE INDEX IF NOT EXISTS idx_vendor_invoice_payments_pi
  ON public.vendor_invoice_payments(pi_quotation_id);

-- Derive tenant/vendor from whichever parent the payment hangs off, and gate
-- PI payments on the PI having been approved (the invoice rule, unchanged).
CREATE OR REPLACE FUNCTION public.prepare_invoice_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD;
  v_pi RECORD;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
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
  ELSE
    SELECT q.tenant_id, q.vendor_id, q.status INTO v_pi
    FROM public.vendor_pi_quotations q WHERE q.id = NEW.pi_quotation_id;

    IF v_pi IS NULL THEN
      RAISE EXCEPTION 'PI/Quotation not found';
    END IF;

    IF v_pi.status <> 'approved'::public.pi_quotation_status THEN
      RAISE EXCEPTION 'Payments can only be recorded against an approved PI/Quotation';
    END IF;

    NEW.tenant_id := v_pi.tenant_id;
    NEW.vendor_id := v_pi.vendor_id;
  END IF;

  NEW.recorded_by := COALESCE(NEW.recorded_by, auth.uid());
  RETURN NEW;
END;
$function$;

-- Only invoices carry a paid/partially_paid status; a payment against a PI has
-- no status to roll up, so leave the PI alone.
CREATE OR REPLACE FUNCTION public.apply_invoice_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC;
  v_amount NUMERIC;
  v_full BOOLEAN;
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

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
$function$;

-- Settlement now carries the money across as well as the project and approver.
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

  -- Roll the invoice's status up to reflect what has already been paid.
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

REVOKE ALL ON FUNCTION public.settle_pi_into_invoice(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_pi_into_invoice(UUID, UUID) TO authenticated, service_role;

-- The staff INSERT policy only recognised invoice-linked payments, so a
-- PI-linked one would be refused. SELECT policies are tenant/vendor scoped
-- already and need no change.
DROP POLICY IF EXISTS "Staff record payments" ON public.vendor_invoice_payments;
CREATE POLICY "Staff record payments"
  ON public.vendor_invoice_payments FOR INSERT TO authenticated
  WITH CHECK (
    is_internal_staff(auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.vendor_invoices i
         WHERE i.id = vendor_invoice_payments.invoice_id
           AND i.tenant_id = get_user_tenant_id(auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.vendor_pi_quotations q
         WHERE q.id = vendor_invoice_payments.pi_quotation_id
           AND q.tenant_id = get_user_tenant_id(auth.uid())
      )
    )
  );

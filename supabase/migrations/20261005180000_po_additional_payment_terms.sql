-- A PO keeps its standard Terms & Conditions (incl. "Payment within 45 days from
-- date of the Invoice"); whoever issues it can append extra payment terms, which
-- print after the standard list. Written right after issue_purchase_order by this
-- narrow function (same pattern/guard as attach_purchase_order_pdf).
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS additional_payment_terms TEXT;

CREATE OR REPLACE FUNCTION public.set_po_additional_terms(p_po_id UUID, p_terms TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.purchase_orders po
     SET additional_payment_terms = NULLIF(btrim(p_terms), '')
   WHERE po.id = p_po_id
     AND po.pdf_file_key IS NULL
     AND is_internal_staff(auth.uid())
     AND get_user_tenant_id(auth.uid()) = po.tenant_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_po_additional_terms(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_po_additional_terms(UUID, TEXT) TO authenticated, service_role;

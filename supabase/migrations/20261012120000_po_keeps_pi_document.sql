-- A Purchase Order keeps its own copy of the PI/Quotation document it was
-- issued against. The PI row is deleted when an invoice settles against it
-- (settle_pi_into_invoice), so without this the PO loses its PI for good.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS pi_file_key TEXT,
  ADD COLUMN IF NOT EXISTS pi_document_type TEXT,
  ADD COLUMN IF NOT EXISTS pi_document_number TEXT;

-- Fill the columns on every new PO from the PI it is issued against, so
-- issue_purchase_order itself does not need to change.
CREATE OR REPLACE FUNCTION public.copy_pi_document_to_po()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pi_quotation_id IS NOT NULL AND NEW.pi_file_key IS NULL THEN
    SELECT q.file_key, q.document_type::text, q.document_number
      INTO NEW.pi_file_key, NEW.pi_document_type, NEW.pi_document_number
      FROM public.vendor_pi_quotations q
     WHERE q.id = NEW.pi_quotation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS copy_pi_document_to_po ON public.purchase_orders;
CREATE TRIGGER copy_pi_document_to_po
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.copy_pi_document_to_po();

-- Existing POs whose PI still exists.
UPDATE public.purchase_orders po
   SET pi_file_key = q.file_key,
       pi_document_type = q.document_type::text,
       pi_document_number = q.document_number
  FROM public.vendor_pi_quotations q
 WHERE q.id = po.pi_quotation_id
   AND po.pi_file_key IS NULL;

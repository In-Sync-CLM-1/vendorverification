-- ============================================================================
-- Unified flow -- step 3b: the cutover
--
-- From here the PI, PO, advance, invoice and credit notes all hang off ONE row
-- of vendor_invoices. The screens that read and write the old PI table are
-- replaced in the same release.
--   1. take a last copy of the PIs (anything filed or decided since step 3a)
--   2. POs follow the row: a PO is linked to the row it was issued against
--   3. vendors may only file PI-stage rows; the invoice is added to the same
--      row through submit_invoice_on_row()
--   4. the old PI table, and vendors filing new advance requests, are closed to
--      anything still running an older copy of the screens
-- The old PI table itself is kept (read-only in practice) until it is retired.
-- ============================================================================

-- 1. last copy
SELECT * FROM public.sync_unified_from_legacy_pi();

-- 2. POs follow the row
UPDATE public.purchase_orders po
   SET invoice_id = po.pi_quotation_id,
       pi_quotation_id = NULL
 WHERE po.pi_quotation_id IS NOT NULL
   AND po.invoice_id IS NULL
   AND EXISTS (SELECT 1 FROM public.vendor_invoices v WHERE v.id = po.pi_quotation_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_one_per_row
  ON public.purchase_orders (invoice_id) WHERE invoice_id IS NOT NULL;

-- 3. vendors file PI-stage rows only
DROP POLICY IF EXISTS "Vendors submit own invoices" ON public.vendor_invoices;
CREATE POLICY "Vendors submit own invoices"
  ON public.vendor_invoices FOR INSERT TO authenticated
  WITH CHECK (
    is_vendor_user(auth.uid())
    AND vendor_id = get_vendor_id(auth.uid())
    AND doc_stage IN ('proforma_invoice', 'quotation')
  );

-- 4. older copies of the screens can no longer file into the old tables
DROP POLICY IF EXISTS "Vendors submit own PI/Quotations" ON public.vendor_pi_quotations;
DROP POLICY IF EXISTS "Project owner reviews PI/Quotations" ON public.vendor_pi_quotations;
DROP POLICY IF EXISTS "Vendors submit own advance requests" ON public.vendor_advance_requests;

-- Allow vendors to re-upload a rejected invoice under the SAME invoice number.
--
-- Previously vendor_invoices had a blanket UNIQUE (tenant_id, vendor_id,
-- invoice_number). Once staff rejected an invoice, its number stayed "taken",
-- so the vendor's corrected re-upload failed with a 23505 unique violation.
--
-- Replace that with a PARTIAL unique index that only enforces uniqueness among
-- non-rejected invoices. Rejected rows no longer occupy the number, freeing the
-- vendor to submit a fresh copy carrying the same number. The re-upload is a new
-- 'submitted' row; the rejected one stays in history for the audit trail.
--
-- A vendor still cannot hold two *active* invoices (submitted / under_review /
-- approved / partially_paid / paid) with the same number.

-- 1. Drop the old blanket unique constraint (default PG name), robustly.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.vendor_invoices'::regclass
    AND contype = 'u'
    AND conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = 'public.vendor_invoices'::regclass
        AND attname IN ('tenant_id', 'vendor_id', 'invoice_number')
    );

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.vendor_invoices DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

-- 2. Partial unique index: enforce uniqueness only for non-rejected invoices.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_invoices_active_number
  ON public.vendor_invoices (tenant_id, vendor_id, invoice_number)
  WHERE status <> 'rejected';

-- ============================================================================
-- Livecom invoice upload, on behalf of a vendor
-- ----------------------------------------------------------------------------
-- Some vendors aren't system-savvy enough to use the vendor portal, so RMPL's
-- Livecom team files the invoice for them. Two things distinguish this from
-- the existing vendor-submitted flow:
--
--   1. Approval: an upload by gaurav.chadha@redefine.in goes straight to
--      'approved'; anyone else's Livecom upload lands as 'submitted' and
--      goes through the exact same staff review queue (StaffInvoices.tsx)
--      as a vendor's own submission.
--   2. Sometimes one combined invoice/PI covers several RMPL projects — the
--      uploader declares each project's share, which must add up to the
--      total. This is a reporting/allocation breakdown, not a separate
--      approval per project; the invoice is still approved/rejected once,
--      as one document.
--
-- Both are handled by a single SECURITY DEFINER RPC (submit_livecom_invoice)
-- rather than a raw RLS INSERT policy, so the approval-routing and the
-- allocation-sum validation can't be bypassed by inserting the rows
-- directly — same reasoning as the existing settle_pi_into_invoice() function.
-- ============================================================================

CREATE TYPE public.invoice_submission_source AS ENUM ('vendor', 'livecom_upload');

ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS submission_source public.invoice_submission_source NOT NULL DEFAULT 'vendor';

-- ----------------------------------------------------------------------------
-- Per-project share of a single invoice/PI. rmpl_project_id/project_* are a
-- read-only snapshot of what was picked at filing time, same reasoning as
-- vendor_pi_quotations — RMPL is a separate Supabase project, no real FK
-- possible.
-- ----------------------------------------------------------------------------
CREATE TABLE public.vendor_invoice_project_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  invoice_id UUID NOT NULL REFERENCES public.vendor_invoices(id) ON DELETE CASCADE,

  rmpl_project_id UUID NOT NULL,
  project_number TEXT,
  project_name TEXT NOT NULL,
  project_owner_user_id UUID,
  project_owner_name TEXT,
  project_owner_email TEXT,

  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (invoice_id, rmpl_project_id)
);

CREATE INDEX idx_vendor_invoice_project_allocations_invoice
  ON public.vendor_invoice_project_allocations(invoice_id);
CREATE INDEX idx_vendor_invoice_project_allocations_tenant
  ON public.vendor_invoice_project_allocations(tenant_id);

ALTER TABLE public.vendor_invoice_project_allocations ENABLE ROW LEVEL SECURITY;

-- No direct INSERT policy for anyone but admins — rows are written only by
-- submit_livecom_invoice() below, which validates the split sums to the
-- invoice total before anything is committed.
CREATE POLICY "Staff view invoice project allocations"
  ON public.vendor_invoice_project_allocations FOR SELECT TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins manage invoice project allocations"
  ON public.vendor_invoice_project_allocations FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Vendors view own invoice project allocations"
  ON public.vendor_invoice_project_allocations FOR SELECT TO authenticated
  USING (
    is_vendor_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.vendor_invoices i
       WHERE i.id = invoice_id AND i.vendor_id = get_vendor_id(auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- submit_livecom_invoice: the only way a Livecom upload gets created.
--   p_allocations is a JSON array of
--   {rmpl_project_id, project_number, project_name, project_owner_user_id,
--    project_owner_name, project_owner_email, amount}
--   Pass an empty array/NULL when the invoice isn't split — the legacy
--   single-project columns on vendor_invoices only get filled when exactly
--   one project is passed (same columns settle_pi_into_invoice populates),
--   a split invoice leaves those NULL and lives entirely in the allocations
--   table so it isn't misread as a single-project invoice downstream.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_livecom_invoice(
  p_vendor_id UUID,
  p_invoice_number TEXT,
  p_invoice_date DATE,
  p_invoice_amount NUMERIC,
  p_gst_amount NUMERIC,
  p_description TEXT,
  p_po_number TEXT,
  p_invoice_file_key TEXT,
  p_po_file_key TEXT,
  p_allocations JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor RECORD;
  v_caller_email TEXT;
  v_status public.invoice_status;
  v_invoice_id UUID;
  v_alloc JSONB;
  v_alloc_count INT := 0;
  v_alloc_total NUMERIC := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'livecom_uploader'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorised to upload an invoice on a vendor''s behalf';
  END IF;

  IF p_invoice_amount IS NULL OR p_invoice_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid invoice amount';
  END IF;

  SELECT v.tenant_id, v.current_status INTO v_vendor
  FROM public.vendors v WHERE v.id = p_vendor_id;

  IF v_vendor IS NULL OR v_vendor.tenant_id <> public.get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;
  IF v_vendor.current_status <> 'approved'::public.vendor_status THEN
    RAISE EXCEPTION 'Only approved vendors can receive an invoice';
  END IF;

  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    SELECT COUNT(*), COALESCE(SUM((elem->>'amount')::NUMERIC), 0)
      INTO v_alloc_count, v_alloc_total
    FROM jsonb_array_elements(p_allocations) elem;

    -- Small tolerance, not exact equality — the frontend sums floating-point
    -- rupee amounts before this is ever a JSON number, so two legitimately
    -- equal splits can differ by a fraction of a paisa.
    IF ABS(v_alloc_total - p_invoice_amount) > 0.01 THEN
      RAISE EXCEPTION 'Project shares (%) must add up to the invoice amount (%)', v_alloc_total, p_invoice_amount;
    END IF;
  END IF;

  SELECT lower(email) INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  v_status := CASE
    WHEN v_caller_email = 'gaurav.chadha@redefine.in' THEN 'approved'::public.invoice_status
    ELSE 'submitted'::public.invoice_status
  END;

  INSERT INTO public.vendor_invoices (
    tenant_id, vendor_id, invoice_number, invoice_date, invoice_amount, gst_amount,
    description, po_number, po_file_key, invoice_file_key, status, submitted_by,
    submission_source, reviewed_by, reviewed_at,
    rmpl_project_id, project_number, project_name,
    project_owner_user_id, project_owner_name, project_owner_email
  ) VALUES (
    v_vendor.tenant_id, p_vendor_id, trim(p_invoice_number), p_invoice_date, p_invoice_amount, COALESCE(p_gst_amount, 0),
    NULLIF(trim(COALESCE(p_description, '')), ''), NULLIF(trim(COALESCE(p_po_number, '')), ''),
    p_po_file_key, p_invoice_file_key, v_status, auth.uid(),
    'livecom_upload'::public.invoice_submission_source,
    CASE WHEN v_status = 'approved'::public.invoice_status THEN auth.uid() ELSE NULL END,
    CASE WHEN v_status = 'approved'::public.invoice_status THEN now() ELSE NULL END,
    CASE WHEN v_alloc_count = 1 THEN (p_allocations->0->>'rmpl_project_id')::UUID ELSE NULL END,
    CASE WHEN v_alloc_count = 1 THEN p_allocations->0->>'project_number' ELSE NULL END,
    CASE WHEN v_alloc_count = 1 THEN p_allocations->0->>'project_name' ELSE NULL END,
    CASE WHEN v_alloc_count = 1 THEN NULLIF(p_allocations->0->>'project_owner_user_id', '')::UUID ELSE NULL END,
    CASE WHEN v_alloc_count = 1 THEN p_allocations->0->>'project_owner_name' ELSE NULL END,
    CASE WHEN v_alloc_count = 1 THEN p_allocations->0->>'project_owner_email' ELSE NULL END
  )
  RETURNING id INTO v_invoice_id;

  IF v_alloc_count > 0 THEN
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      INSERT INTO public.vendor_invoice_project_allocations (
        tenant_id, invoice_id, rmpl_project_id, project_number, project_name,
        project_owner_user_id, project_owner_name, project_owner_email, amount
      ) VALUES (
        v_vendor.tenant_id, v_invoice_id,
        (v_alloc->>'rmpl_project_id')::UUID,
        v_alloc->>'project_number',
        v_alloc->>'project_name',
        NULLIF(v_alloc->>'project_owner_user_id', '')::UUID,
        v_alloc->>'project_owner_name',
        v_alloc->>'project_owner_email',
        (v_alloc->>'amount')::NUMERIC
      );
    END LOOP;
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_livecom_invoice(UUID, TEXT, DATE, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_livecom_invoice(UUID, TEXT, DATE, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

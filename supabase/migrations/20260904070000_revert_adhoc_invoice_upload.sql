-- ============================================================================
-- Revert adhoc invoice upload
-- The feature (adhoc_invoice_uploader role + is_adhoc invoice path, added by
-- 20260904060000 + a since-removed 20260904060100) is not needed. That
-- second migration was applied live via the Management API but never
-- successfully replayed by CI (its ADD CONSTRAINT wasn't idempotent, so
-- `supabase db push` failed and it was never marked applied) — it's deleted
-- from this repo rather than fixed. This migration undoes what it did
-- directly against the live schema. Role grants were revoked directly too
-- (no migration writes user data).
--
-- Not undone: the 'adhoc_invoice_uploader' and 'adhoc_upload' enum values
-- (added to public.app_role / public.invoice_submission_source — the latter
-- by the deleted migration). Postgres has no DROP VALUE for enums — removing
-- one means rebuilding the type and every column/policy/function that
-- references it. Left as unused, inert labels rather than taking on that
-- risk for a same-day revert.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prepare_vendor_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor RECORD;
BEGIN
  SELECT v.tenant_id, v.current_status INTO v_vendor
  FROM public.vendors v WHERE v.id = NEW.vendor_id;

  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  NEW.tenant_id := v_vendor.tenant_id;
  NEW.submitted_by := COALESCE(NEW.submitted_by, auth.uid());

  IF is_vendor_user(auth.uid()) THEN
    IF v_vendor.current_status <> 'approved'::public.vendor_status THEN
      RAISE EXCEPTION 'Only approved vendors can submit invoices';
    END IF;
    NEW.status := 'submitted'::public.invoice_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.submit_adhoc_invoice(TEXT, TEXT, TEXT, DATE, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT);

-- Safe to delete outright: the feature never shipped to real use (role
-- grants were revoked same-day, before either holder used it).
DELETE FROM public.vendor_invoices WHERE is_adhoc = true;

ALTER TABLE public.vendor_invoices
  DROP CONSTRAINT IF EXISTS vendor_invoices_adhoc_shape;

ALTER TABLE public.vendor_invoices
  DROP COLUMN IF EXISTS is_adhoc,
  DROP COLUMN IF EXISTS adhoc_vendor_name,
  DROP COLUMN IF EXISTS adhoc_vendor_contact;

ALTER TABLE public.vendor_invoices
  ALTER COLUMN vendor_id SET NOT NULL;

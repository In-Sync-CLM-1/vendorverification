-- ============================================================================
-- Add the "Returned by Approver" lane to the workflow.
--
-- Background: until now there was a single "Send Back" action, used by makers
-- and intended to bounce the application back to the vendor for corrections.
-- Product decision (2026-05-07): error paths for vendors are reject-only and
-- vendors must do a fresh submission if they want another shot. The send-back
-- action survives only as a way for the *approver* to return the application
-- to the *maker* for re-review.
--
-- This migration:
--   1. Adds vendor_status 'returned_to_maker'.
--   2. Allows makers to access (read + update) vendors in returned_to_maker.
--   3. Migrates the ECR vendor (the only one currently in sent_back, set by an
--      approver) to returned_to_maker so it lands in the maker's queue.
--
-- The legacy 'sent_back' enum value is left in place because Postgres can't
-- drop enum values that have been referenced. The application no longer
-- writes it.
-- ============================================================================

ALTER TYPE public.vendor_status ADD VALUE IF NOT EXISTS 'returned_to_maker';
COMMIT;

BEGIN;

-- Update can_staff_access_vendor: makers can act on returned_to_maker
CREATE OR REPLACE FUNCTION public.can_staff_access_vendor(_user_id UUID, _vendor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.vendors v
        WHERE v.id = _vendor_id
        AND v.tenant_id = public.get_user_tenant_id(_user_id)
        AND (
            public.is_admin(_user_id)
            OR (public.has_role(_user_id, 'maker') AND v.current_status IN ('draft', 'pending_review', 'returned_to_maker'))
            OR (public.has_role(_user_id, 'approver') AND v.current_status = 'pending_approval')
        )
    )
$$;

-- Migrate the existing in-flight sent-back records (set by an approver) into
-- the new lane. There's exactly one such row today (ECR Technical) but the
-- query is generic.
UPDATE public.vendors
SET current_status = 'returned_to_maker'::vendor_status,
    updated_at = now()
WHERE current_status = 'sent_back'::vendor_status;

COMMIT;

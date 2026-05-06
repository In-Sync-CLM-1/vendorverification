-- ============================================================================
-- Collapse the workflow to maker → approver. Remove the checker step.
--   - Reassign every checker role to maker (skip rows where the user is
--     already a maker so we don't violate UNIQUE(user_id, tenant_id, role)).
--   - Drop the checker branch from can_staff_access_vendor.
--   - Move any vendor stuck in 'in_verification' to 'pending_approval'.
--
-- The `checker` enum value on app_role and the `in_verification` value on
-- vendor_status are left in place — Postgres won't drop enum values that
-- have ever been referenced and the cost of recreating those types
-- outweighs the benefit. The app no longer references them.
-- ============================================================================

BEGIN;

-- 1. Reassign existing checker rows to maker
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT user_id, tenant_id, 'maker'::app_role
FROM public.user_roles
WHERE role = 'checker'::app_role
ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

DELETE FROM public.user_roles WHERE role = 'checker'::app_role;

-- 2. Migrate any vendors that were sitting in the verification step
UPDATE public.vendors
SET current_status = 'pending_approval'::vendor_status,
    updated_at = now()
WHERE current_status = 'in_verification'::vendor_status;

-- 3. Drop the checker branch from the access function
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
            OR (public.has_role(_user_id, 'maker') AND v.current_status IN ('draft', 'pending_review'))
            OR (public.has_role(_user_id, 'approver') AND v.current_status = 'pending_approval')
        )
    )
$$;

COMMIT;

-- ============================================================================
-- Make the platform-admin command center actually see across tenants.
-- Today every RLS policy filters by `tenant_id = get_user_tenant_id(auth.uid())`
-- which scopes the platform admin to In-Sync only — other tenants' counts
-- come back as 0 and their plan/status as null in the orgs table.
--
-- This migration:
--   1. Adds an is_platform_admin() helper.
--   2. Adds SELECT-only override policies for platform_admin on the tables
--      the dashboard reads. Existing tenant-scoped policies are untouched
--      (PostgreSQL OR's multiple permissive policies).
--   3. Updates the subscription-creation trigger to set a 14-day trial
--      window on every new tenant, and backfills missing windows on
--      existing trial rows.
-- ============================================================================

BEGIN;

-- 1. Helper -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'platform_admin'::app_role
  )
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(UUID) TO authenticated;

-- 2. Cross-tenant SELECT policies for platform admin ------------------------

DROP POLICY IF EXISTS "Platform admins can read all profiles" ON public.profiles;
CREATE POLICY "Platform admins can read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can read all vendors" ON public.vendors;
CREATE POLICY "Platform admins can read all vendors"
  ON public.vendors FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can read all vendor_users" ON public.vendor_users;
CREATE POLICY "Platform admins can read all vendor_users"
  ON public.vendor_users FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can read all subscriptions" ON public.org_subscriptions;
CREATE POLICY "Platform admins can read all subscriptions"
  ON public.org_subscriptions FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can read all whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "Platform admins can read all whatsapp messages"
  ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 3. Trial window: trigger sets 14 days on every new tenant -----------------

CREATE OR REPLACE FUNCTION public.create_tenant_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.org_subscriptions (
    tenant_id,
    plan,
    status,
    vendor_limit,
    monthly_price,
    billing_cycle_start,
    billing_cycle_end
  )
  VALUES (
    NEW.id,
    'free_trial',
    'trial',
    5,
    0,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '14 days'
  )
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3b. Backfill: any trial subscription with a null window gets one based on
-- the tenant's created_at, with a minimum of today + 14 days so an admin
-- inspecting it doesn't see a trial that already "ended" in the past.

UPDATE public.org_subscriptions os
SET
  billing_cycle_start = COALESCE(os.billing_cycle_start, t.created_at::date),
  billing_cycle_end   = COALESCE(
    os.billing_cycle_end,
    GREATEST(t.created_at::date + INTERVAL '14 days', CURRENT_DATE + INTERVAL '14 days')::date
  ),
  updated_at = now()
FROM public.tenants t
WHERE os.tenant_id = t.id
  AND os.status = 'trial'
  AND os.billing_cycle_end IS NULL;

COMMIT;

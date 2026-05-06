-- ============================================================================
-- Fix: org creator must become admin of their org
-- ----------------------------------------------------------------------------
-- 1. Backfill missing roles for the creator of "test" org (tenant_id
--    0cce7bce-59fd-4bac-b1d0-117085504cfe) — registration finished tenant +
--    profile but never wrote the role rows.
-- 2. Replace the legacy global UNIQUE(user_id, role) on user_roles with a
--    per-tenant UNIQUE(user_id, tenant_id, role) so the same person can be
--    admin of more than one org.
-- 3. Remove abandoned tenants (no profiles, no roles, no vendors) along with
--    their auto-seeded vendor_categories and org_subscriptions rows.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Backfill roles for the test org creator
-- ----------------------------------------------------------------------------

INSERT INTO public.user_roles (user_id, tenant_id, role)
VALUES
  ('37419a71-62ab-4d78-9810-b4d1cfa3a851'::uuid, '0cce7bce-59fd-4bac-b1d0-117085504cfe'::uuid, 'admin'::app_role),
  ('37419a71-62ab-4d78-9810-b4d1cfa3a851'::uuid, '0cce7bce-59fd-4bac-b1d0-117085504cfe'::uuid, 'maker'::app_role),
  ('37419a71-62ab-4d78-9810-b4d1cfa3a851'::uuid, '0cce7bce-59fd-4bac-b1d0-117085504cfe'::uuid, 'checker'::app_role),
  ('37419a71-62ab-4d78-9810-b4d1cfa3a851'::uuid, '0cce7bce-59fd-4bac-b1d0-117085504cfe'::uuid, 'approver'::app_role)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Per-tenant uniqueness on user_roles
-- ----------------------------------------------------------------------------

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_tenant_id_role_key
  UNIQUE (user_id, tenant_id, role);

-- ----------------------------------------------------------------------------
-- 3. Delete abandoned tenants
-- ----------------------------------------------------------------------------

CREATE TEMP TABLE _abandoned_tenants ON COMMIT DROP AS
SELECT t.id
FROM public.tenants t
WHERE t.id <> 'a0000000-0000-0000-0000-000000000001'::uuid
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.tenant_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.tenant_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM public.vendors v WHERE v.tenant_id = t.id);

DELETE FROM public.staff_referral_codes WHERE tenant_id IN (SELECT id FROM _abandoned_tenants);
DELETE FROM public.vendor_categories WHERE tenant_id IN (SELECT id FROM _abandoned_tenants);
DELETE FROM public.document_types WHERE tenant_id IN (SELECT id FROM _abandoned_tenants);
DELETE FROM public.category_documents WHERE tenant_id IN (SELECT id FROM _abandoned_tenants);
DELETE FROM public.org_subscriptions WHERE tenant_id IN (SELECT id FROM _abandoned_tenants);
DELETE FROM public.billing_transactions WHERE tenant_id IN (SELECT id FROM _abandoned_tenants);
DELETE FROM public.coupon_redemptions WHERE tenant_id IN (SELECT id FROM _abandoned_tenants);
DELETE FROM public.public_otp_verifications WHERE tenant_id IN (SELECT id FROM _abandoned_tenants);
DELETE FROM public.api_keys WHERE tenant_id IN (SELECT id FROM _abandoned_tenants);
DELETE FROM public.webhook_endpoints WHERE tenant_id IN (SELECT id FROM _abandoned_tenants);

DELETE FROM public.tenants WHERE id IN (SELECT id FROM _abandoned_tenants);

COMMIT;

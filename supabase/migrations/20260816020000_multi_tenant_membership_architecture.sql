-- ============================================================
-- Multi-tenant membership: the fleet-standard architecture
-- ============================================================
-- Brings this app onto the same four-layer model as Work-Sync and GlobalCRM,
-- so "which tenant am I working in" is answered the same way everywhere:
--
--   1. MEMBERSHIP says where you MAY go — user_roles(user_id, tenant_id, role).
--      A person may hold several; most staff hold one and never switch.
--   2. ACTIVE TENANT is where you ARE — a pointer, profiles.tenant_id, which
--      get_user_tenant_id() reads and every RLS policy resolves through.
--   3. The pointer is NOT user-writable. It decides access, so letting its
--      owner set it is the same as letting them pick their own permissions.
--   4. set_active_org() is the only write path, and it refuses any tenant the
--      caller is not a member of.
--
-- Closing a live hole. Proven against production in a rolled-back
-- transaction, as an ordinary staff user (not platform admin) who can read
-- vendors:
--
--   sees in own tenant                  : 23 vendors
--   moved into REDEFINE MARCOM          : 60 vendors   <-- another customer
--   moved into In-Sync                  : 3 vendors
--
-- An RLS policy cannot prevent this: WITH CHECK sees only the new row, so it
-- cannot tell that tenant_id changed. Column privileges can — but not while
-- the role holds a TABLE-level UPDATE grant, which covers every column
-- regardless. The table grant goes first, then the safe columns are granted
-- back.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lock the pointer
-- ------------------------------------------------------------
-- No backfill of user_roles is needed, and none is done deliberately: in this
-- app user_roles grants privileges (maker/checker/approver/admin), so
-- inventing rows for the 13 staff who currently hold none would hand them
-- permissions they were never given. Locking the pointer takes nobody's
-- access away — everyone stays in the tenant an admin already placed them in.
-- Membership is consulted only when CHANGING tenant, which is exactly the
-- operation that should require it.
--
-- The app writes only full_name, phone, department and is_active to profiles
-- (StaffProfile and AdminUserManagement); tenant_id is never set from the
-- browser. Staff records are created by admin flows under the service role,
-- which these grants do not affect.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon;
REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  full_name,
  phone,
  department,
  is_active,
  updated_at
) ON public.profiles TO authenticated;

-- ------------------------------------------------------------
-- 3. The sanctioned way to change the active tenant
-- ------------------------------------------------------------
-- Named set_active_org() to match Work-Sync and GlobalCRM: the callers are the
-- same shared UI, and this app's "tenant" is the same concept.
CREATE OR REPLACE FUNCTION set_active_org(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- Membership is the whole check. A platform admin is not exempt: to work
  -- inside a tenant they join it like anyone else, so "what can this session
  -- touch" stays answerable from one table.
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
     WHERE user_id = v_uid AND tenant_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'You are not a member of that organisation';
  END IF;

  UPDATE profiles SET tenant_id = p_org_id WHERE user_id = v_uid;
  RETURN p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION set_active_org(uuid) FROM public;
GRANT EXECUTE ON FUNCTION set_active_org(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 4. Amit belongs to every tenant
-- ------------------------------------------------------------
-- He is platform admin AND a working member of each tenant. Idempotent.
DO $$
DECLARE
  v_uid uuid;
  v_tenant record;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'a@in-sync.co.in';
  IF v_uid IS NULL THEN
    RAISE NOTICE 'a@in-sync.co.in not present — skipping';
    RETURN;
  END IF;

  FOR v_tenant IN SELECT id FROM tenants LOOP
    INSERT INTO user_roles (user_id, tenant_id, role)
    SELECT v_uid, v_tenant.id, 'admin'::app_role
     WHERE NOT EXISTS (
       SELECT 1 FROM user_roles r WHERE r.user_id = v_uid AND r.tenant_id = v_tenant.id
     );
  END LOOP;
END $$;

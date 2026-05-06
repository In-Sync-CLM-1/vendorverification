-- ============================================================================
-- Platform-admin RPC to disable/enable an organization. When disabling, all
-- sessions for the tenant's users are revoked so anyone signed in is forced
-- back to the login screen on their next request — required for compliance
-- breach scenarios where access has to be cut immediately.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_organization_active(
  _tenant_id UUID,
  _active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller UUID := auth.uid();
  caller_tenant UUID;
  is_platform BOOLEAN;
  affected_users UUID[];
  sessions_killed INTEGER := 0;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = caller AND role = 'platform_admin'::app_role
  ) INTO is_platform;

  IF NOT is_platform THEN
    RAISE EXCEPTION 'Only platform admins can change org status' USING ERRCODE = '42501';
  END IF;

  IF _tenant_id = 'a0000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'Cannot change status of the platform default organization' USING ERRCODE = '22023';
  END IF;

  SELECT tenant_id INTO caller_tenant FROM public.profiles WHERE user_id = caller LIMIT 1;
  IF caller_tenant = _tenant_id THEN
    RAISE EXCEPTION 'Cannot change status of the organization you belong to' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id) THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = '02000';
  END IF;

  UPDATE public.tenants SET is_active = _active, updated_at = now() WHERE id = _tenant_id;

  -- On disable: kill every session for every user that belongs to the tenant.
  -- Also revoke their refresh tokens so a token replay can't reissue access.
  IF _active = false THEN
    SELECT COALESCE(array_agg(DISTINCT uid), '{}') INTO affected_users
    FROM (
      SELECT user_id AS uid FROM public.profiles WHERE tenant_id = _tenant_id
      UNION
      SELECT user_id AS uid FROM public.vendor_users WHERE tenant_id = _tenant_id
    ) s;

    IF array_length(affected_users, 1) > 0 THEN
      WITH deleted_sessions AS (
        DELETE FROM auth.sessions WHERE user_id = ANY(affected_users) RETURNING 1
      )
      SELECT COUNT(*) INTO sessions_killed FROM deleted_sessions;

      DELETE FROM auth.refresh_tokens WHERE user_id::uuid = ANY(affected_users);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', _tenant_id,
    'is_active', _active,
    'sessions_terminated', sessions_killed,
    'affected_users', COALESCE(array_length(affected_users, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_organization_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organization_active(UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- Platform-admin RPC to extend an org's trial. Only valid when the
-- subscription is currently in trial. Pushes billing_cycle_end forward by
-- the requested days from whichever is later: today or the existing end.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.extend_organization_trial(
  _tenant_id UUID,
  _additional_days INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  is_platform BOOLEAN;
  current_status TEXT;
  current_end DATE;
  new_end DATE;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF _additional_days IS NULL OR _additional_days <= 0 OR _additional_days > 365 THEN
    RAISE EXCEPTION 'Additional days must be between 1 and 365' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = caller AND role = 'platform_admin'::app_role
  ) INTO is_platform;

  IF NOT is_platform THEN
    RAISE EXCEPTION 'Only platform admins can extend trials' USING ERRCODE = '42501';
  END IF;

  SELECT status::text, billing_cycle_end
  INTO current_status, current_end
  FROM public.org_subscriptions
  WHERE tenant_id = _tenant_id;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'No subscription found for this organization' USING ERRCODE = '02000';
  END IF;

  IF current_status <> 'trial' THEN
    RAISE EXCEPTION 'Trial extension is only valid while the subscription is in trial (current: %)', current_status
      USING ERRCODE = '22023';
  END IF;

  new_end := GREATEST(COALESCE(current_end, CURRENT_DATE), CURRENT_DATE) + _additional_days;

  UPDATE public.org_subscriptions
  SET billing_cycle_end = new_end,
      updated_at = now()
  WHERE tenant_id = _tenant_id;

  RETURN jsonb_build_object(
    'tenant_id', _tenant_id,
    'previous_end', current_end,
    'new_end', new_end,
    'days_added', _additional_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.extend_organization_trial(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_organization_trial(UUID, INTEGER) TO authenticated;

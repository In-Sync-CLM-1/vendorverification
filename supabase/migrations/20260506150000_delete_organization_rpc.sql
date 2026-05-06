-- ============================================================================
-- Platform-admin-only "delete organization" RPC.
-- Wipes a tenant and every child row that references it, in a single
-- transaction. Storage files (vendor documents) are deleted by the edge
-- function before this RPC is called — those don't live in Postgres.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_organization(_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  caller_tenant UUID;
  is_platform BOOLEAN;
  tenant_slug TEXT;
  deleted_users UUID[];
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = caller AND role = 'platform_admin'::app_role
  ) INTO is_platform;

  IF NOT is_platform THEN
    RAISE EXCEPTION 'Only platform admins can delete organizations' USING ERRCODE = '42501';
  END IF;

  IF _tenant_id = 'a0000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'Cannot delete the platform default organization' USING ERRCODE = '22023';
  END IF;

  SELECT tenant_id INTO caller_tenant FROM public.profiles WHERE user_id = caller LIMIT 1;
  IF caller_tenant = _tenant_id THEN
    RAISE EXCEPTION 'Cannot delete the organization you belong to' USING ERRCODE = '22023';
  END IF;

  SELECT slug INTO tenant_slug FROM public.tenants WHERE id = _tenant_id;
  IF tenant_slug IS NULL THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = '02000';
  END IF;

  -- Collect auth user ids that are tied ONLY to this tenant (no profile or
  -- vendor_users record in any other tenant). These get deleted from auth.users
  -- after data wipe so the org's people can't sign in to a phantom account.
  SELECT COALESCE(array_agg(DISTINCT user_id), '{}') INTO deleted_users
  FROM (
    SELECT user_id FROM public.profiles WHERE tenant_id = _tenant_id
    UNION
    SELECT user_id FROM public.vendor_users WHERE tenant_id = _tenant_id
  ) s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p2
    WHERE p2.user_id = s.user_id AND p2.tenant_id <> _tenant_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.vendor_users vu2
    WHERE vu2.user_id = s.user_id AND vu2.tenant_id <> _tenant_id
  );

  -- Delete child rows. Order matters because of FKs between child tables
  -- (e.g. workflow_history -> vendors, vendor_documents -> vendors).

  DELETE FROM public.workflow_history WHERE tenant_id = _tenant_id;
  DELETE FROM public.workflow_assignments WHERE tenant_id = _tenant_id;
  DELETE FROM public.notifications WHERE tenant_id = _tenant_id;
  DELETE FROM public.consent_records WHERE tenant_id = _tenant_id;
  DELETE FROM public.data_requests WHERE tenant_id = _tenant_id;
  DELETE FROM public.breach_notifications WHERE tenant_id = _tenant_id;
  DELETE FROM public.pii_access_log WHERE tenant_id = _tenant_id;
  DELETE FROM public.fraud_alerts WHERE tenant_id = _tenant_id;
  DELETE FROM public.document_analyses WHERE tenant_id = _tenant_id;
  DELETE FROM public.vendor_documents WHERE tenant_id = _tenant_id;
  DELETE FROM public.vendor_verifications WHERE tenant_id = _tenant_id;
  DELETE FROM public.vendor_invitations WHERE tenant_id = _tenant_id;
  DELETE FROM public.vendor_users WHERE tenant_id = _tenant_id;
  DELETE FROM public.vendors WHERE tenant_id = _tenant_id;
  DELETE FROM public.staff_referral_codes WHERE tenant_id = _tenant_id;
  DELETE FROM public.whatsapp_messages WHERE tenant_id = _tenant_id;
  DELETE FROM public.whatsapp_templates WHERE tenant_id = _tenant_id;
  DELETE FROM public.whatsapp_settings WHERE tenant_id = _tenant_id;
  DELETE FROM public.api_keys WHERE tenant_id = _tenant_id;
  DELETE FROM public.webhook_endpoints WHERE tenant_id = _tenant_id;
  DELETE FROM public.coupon_redemptions WHERE tenant_id = _tenant_id;
  DELETE FROM public.billing_transactions WHERE tenant_id = _tenant_id;
  DELETE FROM public.org_subscriptions WHERE tenant_id = _tenant_id;
  DELETE FROM public.public_otp_verifications WHERE tenant_id = _tenant_id;
  DELETE FROM public.category_documents WHERE tenant_id = _tenant_id;
  DELETE FROM public.document_types WHERE tenant_id = _tenant_id;
  DELETE FROM public.vendor_categories WHERE tenant_id = _tenant_id;
  DELETE FROM public.user_roles WHERE tenant_id = _tenant_id;
  DELETE FROM public.profiles WHERE tenant_id = _tenant_id;

  DELETE FROM public.tenants WHERE id = _tenant_id;

  RETURN jsonb_build_object(
    'tenant_id', _tenant_id,
    'slug', tenant_slug,
    'orphaned_user_ids', deleted_users
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_organization(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_organization(UUID) TO authenticated;

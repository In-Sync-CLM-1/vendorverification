-- ============================================================================
-- Fix get_vendor_decrypted: pii_access_log.tenant_id became NOT NULL after the
-- multi-tenancy migration, but this RPC still inserted without it. Every call
-- failed with a 400 once any vendor record was loaded post-migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_vendor_decrypted(p_vendor_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  result JSON;
  calling_user UUID;
  v_tenant_id UUID;
BEGIN
  calling_user := auth.uid();

  IF NOT (is_internal_staff(calling_user) OR is_admin(calling_user)) THEN
    IF NOT (is_vendor_user(calling_user) AND p_vendor_id = get_vendor_id(calling_user)) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.vendors WHERE id = p_vendor_id;

  INSERT INTO public.pii_access_log (user_id, tenant_id, table_name, column_name, vendor_id, purpose)
  VALUES (calling_user, v_tenant_id, 'vendors', 'all_pii_fields', p_vendor_id, 'vendor_detail_view');

  SELECT json_build_object(
    'id', v.id, 'vendor_code', v.vendor_code, 'category_id', v.category_id,
    'company_name', v.company_name, 'trade_name', v.trade_name,
    'registered_address', v.registered_address, 'operational_address', v.operational_address,
    'primary_contact_name', v.primary_contact_name, 'secondary_contact_name', v.secondary_contact_name,
    'salutation', v.salutation, 'constitution_type', v.constitution_type,
    'nominee_name', v.nominee_name, 'bank_name', v.bank_name, 'bank_branch', v.bank_branch,
    'current_status', v.current_status, 'submitted_at', v.submitted_at,
    'approved_at', v.approved_at, 'rejected_at', v.rejected_at,
    'rejection_reason', v.rejection_reason, 'sent_back_reason', v.sent_back_reason,
    'referred_by', v.referred_by, 'created_at', v.created_at, 'updated_at', v.updated_at,
    'pan_number', COALESCE(decrypt_pii(v.pan_number_encrypted), v.pan_number),
    'gst_number', COALESCE(decrypt_pii(v.gst_number_encrypted), v.gst_number),
    'cin_number', COALESCE(decrypt_pii(v.cin_number_encrypted), v.cin_number),
    'bank_account_number', COALESCE(decrypt_pii(v.bank_account_number_encrypted), v.bank_account_number),
    'bank_ifsc', COALESCE(decrypt_pii(v.bank_ifsc_encrypted), v.bank_ifsc),
    'primary_mobile', COALESCE(decrypt_pii(v.primary_mobile_encrypted), v.primary_mobile),
    'primary_email', COALESCE(decrypt_pii(v.primary_email_encrypted), v.primary_email),
    'secondary_mobile', COALESCE(decrypt_pii(v.secondary_mobile_encrypted), v.secondary_mobile),
    'nominee_contact', COALESCE(decrypt_pii(v.nominee_contact_encrypted), v.nominee_contact)
  ) INTO result
  FROM public.vendors v WHERE v.id = p_vendor_id;

  RETURN result;
END;
$function$;

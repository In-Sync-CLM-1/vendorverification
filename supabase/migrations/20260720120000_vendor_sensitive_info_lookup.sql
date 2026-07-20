-- ============================================================================
-- Secure single-vendor sensitive-info lookup for signed-in staff.
-- Any active staff user (maker/checker/approver/admin all blur together in
-- practice) can look up ONE vendor's identity/financial fields at a time —
-- never a bulk list. Adds MSME registration number (previously only an
-- uploaded certificate, never a stored field) alongside the existing
-- encrypted PII columns. A dedicated RPC (not the general-purpose
-- get_vendor_decrypted) keeps this feature's audit trail distinguishable
-- from normal vendor-review access.
-- ============================================================================

-- 1. MSME number joins the existing encrypted-PII pattern on vendors.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS msme_number TEXT,
  ADD COLUMN IF NOT EXISTS msme_number_encrypted BYTEA;

CREATE OR REPLACE FUNCTION public.encrypt_vendor_pii()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.pan_number IS NOT NULL AND NEW.pan_number != '' THEN
    NEW.pan_number_encrypted := encrypt_pii(NEW.pan_number);
    NEW.pan_number := NULL;
  END IF;
  IF NEW.gst_number IS NOT NULL AND NEW.gst_number != '' THEN
    NEW.gst_number_encrypted := encrypt_pii(NEW.gst_number);
    NEW.gst_number := NULL;
  END IF;
  IF NEW.cin_number IS NOT NULL AND NEW.cin_number != '' THEN
    NEW.cin_number_encrypted := encrypt_pii(NEW.cin_number);
    NEW.cin_number := NULL;
  END IF;
  IF NEW.msme_number IS NOT NULL AND NEW.msme_number != '' THEN
    NEW.msme_number_encrypted := encrypt_pii(NEW.msme_number);
    NEW.msme_number := NULL;
  END IF;
  IF NEW.bank_account_number IS NOT NULL AND NEW.bank_account_number != '' THEN
    NEW.bank_account_number_encrypted := encrypt_pii(NEW.bank_account_number);
    NEW.bank_account_number := NULL;
  END IF;
  IF NEW.bank_ifsc IS NOT NULL AND NEW.bank_ifsc != '' THEN
    NEW.bank_ifsc_encrypted := encrypt_pii(NEW.bank_ifsc);
    NEW.bank_ifsc := NULL;
  END IF;
  IF NEW.primary_mobile IS NOT NULL AND NEW.primary_mobile != ''
     AND NEW.primary_mobile NOT LIKE '****%' THEN
    NEW.primary_mobile_encrypted := encrypt_pii(NEW.primary_mobile);
    NEW.primary_mobile := '****' || RIGHT(NEW.primary_mobile, 4);
  END IF;
  IF NEW.primary_email IS NOT NULL AND NEW.primary_email != ''
     AND NEW.primary_email NOT LIKE '%@***' THEN
    NEW.primary_email_encrypted := encrypt_pii(NEW.primary_email);
    NEW.primary_email := SPLIT_PART(NEW.primary_email, '@', 1) || '@***';
  END IF;
  IF NEW.secondary_mobile IS NOT NULL AND NEW.secondary_mobile != '' THEN
    NEW.secondary_mobile_encrypted := encrypt_pii(NEW.secondary_mobile);
    NEW.secondary_mobile := NULL;
  END IF;
  IF NEW.nominee_contact IS NOT NULL AND NEW.nominee_contact != '' THEN
    NEW.nominee_contact_encrypted := encrypt_pii(NEW.nominee_contact);
    NEW.nominee_contact := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.vendors_decrypted
WITH (security_invoker = on)
AS
SELECT
  id, category_id, current_status, company_name, trade_name,
  registered_address, operational_address,
  primary_contact_name, secondary_contact_name,
  salutation, constitution_type, nominee_name,
  vendor_code, referred_by,
  submitted_at, approved_at, rejected_at, rejection_reason, sent_back_reason,
  bank_name, bank_branch,
  created_at, updated_at,
  COALESCE(decrypt_pii(pan_number_encrypted), pan_number) AS pan_number,
  COALESCE(decrypt_pii(gst_number_encrypted), gst_number) AS gst_number,
  COALESCE(decrypt_pii(cin_number_encrypted), cin_number) AS cin_number,
  COALESCE(decrypt_pii(bank_account_number_encrypted), bank_account_number) AS bank_account_number,
  COALESCE(decrypt_pii(bank_ifsc_encrypted), bank_ifsc) AS bank_ifsc,
  COALESCE(decrypt_pii(primary_mobile_encrypted), primary_mobile) AS primary_mobile,
  COALESCE(decrypt_pii(primary_email_encrypted), primary_email) AS primary_email,
  COALESCE(decrypt_pii(secondary_mobile_encrypted), secondary_mobile) AS secondary_mobile,
  COALESCE(decrypt_pii(nominee_contact_encrypted), nominee_contact) AS nominee_contact,
  COALESCE(decrypt_pii(msme_number_encrypted), msme_number) AS msme_number
FROM public.vendors;

-- 2. Narrow, single-vendor RPC for the sensitive-info lookup screen.
--    Deliberately returns ONLY the identity/financial fields the screen
--    shows — not the full vendor record get_vendor_decrypted returns —
--    and logs under its own purpose so this screen's access trail is
--    distinguishable from ordinary vendor-review lookups.
CREATE OR REPLACE FUNCTION public.get_vendor_sensitive_info(p_vendor_id uuid)
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
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.vendors WHERE id = p_vendor_id;

  INSERT INTO public.pii_access_log (user_id, tenant_id, table_name, column_name, vendor_id, purpose)
  VALUES (calling_user, v_tenant_id, 'vendors', 'sensitive_info_fields', p_vendor_id, 'sensitive_info_lookup');

  SELECT json_build_object(
    'id', v.id, 'vendor_code', v.vendor_code, 'company_name', v.company_name,
    'current_status', v.current_status,
    'primary_email', COALESCE(decrypt_pii(v.primary_email_encrypted), v.primary_email),
    'primary_mobile', COALESCE(decrypt_pii(v.primary_mobile_encrypted), v.primary_mobile),
    'secondary_mobile', COALESCE(decrypt_pii(v.secondary_mobile_encrypted), v.secondary_mobile),
    'bank_name', v.bank_name, 'bank_branch', v.bank_branch,
    'bank_account_number', COALESCE(decrypt_pii(v.bank_account_number_encrypted), v.bank_account_number),
    'bank_ifsc', COALESCE(decrypt_pii(v.bank_ifsc_encrypted), v.bank_ifsc),
    'pan_number', COALESCE(decrypt_pii(v.pan_number_encrypted), v.pan_number),
    'gst_number', COALESCE(decrypt_pii(v.gst_number_encrypted), v.gst_number),
    'cin_number', COALESCE(decrypt_pii(v.cin_number_encrypted), v.cin_number),
    'msme_number', COALESCE(decrypt_pii(v.msme_number_encrypted), v.msme_number)
  ) INTO result
  FROM public.vendors v WHERE v.id = p_vendor_id;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  RETURN result;
END;
$function$;

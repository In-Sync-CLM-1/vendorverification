-- ============================================================================
-- View-only enforcement
-- Several staff write policies only ever checked is_internal_staff() (any
-- active profile in the tenant), not a specific role — the actual write
-- gating lived in the frontend instead. That's fine for every role that
-- existed until now, but the new 'viewer' role needs a real floor: someone
-- who is *only* a viewer must not be able to record a payment, decide an
-- advance request, resolve a fraud alert, review a detail-change request,
-- update an invoice, or reassign workflow — regardless of what the UI shows.
-- This changes nothing for any account that isn't a pure viewer.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_view_only(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'viewer'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('maker', 'approver', 'admin', 'platform_admin', 'accounts')
  )
$$;

DROP POLICY IF EXISTS "Staff can update fraud alerts" ON public.fraud_alerts;
CREATE POLICY "Staff can update fraud alerts"
  ON public.fraud_alerts FOR UPDATE TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()) AND NOT is_view_only(auth.uid()));

DROP POLICY IF EXISTS "Staff review advance requests" ON public.vendor_advance_requests;
CREATE POLICY "Staff review advance requests"
  ON public.vendor_advance_requests FOR UPDATE TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()) AND NOT is_view_only(auth.uid()))
  WITH CHECK (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()) AND NOT is_view_only(auth.uid()));

DROP POLICY IF EXISTS "Staff review change requests" ON public.vendor_detail_change_requests;
CREATE POLICY "Staff review change requests"
  ON public.vendor_detail_change_requests FOR UPDATE TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()) AND NOT is_view_only(auth.uid()))
  WITH CHECK (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()) AND NOT is_view_only(auth.uid()));

DROP POLICY IF EXISTS "Staff record payments" ON public.vendor_invoice_payments;
CREATE POLICY "Staff record payments"
  ON public.vendor_invoice_payments FOR INSERT TO authenticated
  WITH CHECK (
    is_internal_staff(auth.uid())
    AND NOT is_view_only(auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.vendor_invoices i
         WHERE i.id = vendor_invoice_payments.invoice_id
           AND i.tenant_id = get_user_tenant_id(auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.vendor_pi_quotations q
         WHERE q.id = vendor_invoice_payments.pi_quotation_id
           AND q.tenant_id = get_user_tenant_id(auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Staff update invoices" ON public.vendor_invoices;
CREATE POLICY "Staff update invoices"
  ON public.vendor_invoices FOR UPDATE TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()) AND NOT is_view_only(auth.uid()));

DROP POLICY IF EXISTS "Staff can manage assignments" ON public.workflow_assignments;
CREATE POLICY "Staff can manage assignments"
  ON public.workflow_assignments FOR ALL TO authenticated
  USING (is_internal_staff(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()) AND NOT is_view_only(auth.uid()));

-- PII reveal (bank account/PAN/GST/etc.) must also refuse a pure viewer,
-- same rule as everything else above. Body otherwise unchanged from the live
-- function (20260720120000_vendor_sensitive_info_lookup.sql) — only the new
-- is_view_only guard is added.
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

  IF public.is_view_only(calling_user) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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

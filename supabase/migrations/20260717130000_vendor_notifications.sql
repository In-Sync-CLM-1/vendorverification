-- ============================================================================
-- Vendor status-change notifications
-- Email (and WhatsApp once the utility template is approved) to the vendor
-- when their invoice is approved, rejected, or a payment is recorded.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Decrypted vendor contact for outbound notifications. Plaintext
-- primary_email/primary_mobile are masked after encrypt_vendor_pii runs, so
-- the edge function must go through decrypt_pii — same reason
-- find_vendor_by_contact exists. service_role only.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vendor_contact(p_vendor_id UUID)
RETURNS TABLE (
  company_name TEXT,
  primary_contact_name TEXT,
  email TEXT,
  mobile TEXT,
  tenant_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.company_name,
    v.primary_contact_name,
    COALESCE(decrypt_pii(v.primary_email_encrypted), NULLIF(v.primary_email, '')),
    COALESCE(decrypt_pii(v.primary_mobile_encrypted), NULLIF(v.primary_mobile, '')),
    v.tenant_id
  FROM public.vendors v
  WHERE v.id = p_vendor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_contact(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vendor_contact(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_vendor_contact(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_contact(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- Register the WhatsApp utility template locally (pending Meta approval via
-- Exotel). The notify function only sends WhatsApp once this row's status
-- flips to 'approved'.
-- ----------------------------------------------------------------------------
UPDATE public.whatsapp_templates SET
  content = 'Hi {{1}}, here''s an update on your invoice: {{2}}. Log in to the Vendor Verification Portal to view full details and payment history: https://vendorverification.in-sync.co.in/vendor/portal',
  variables = '[{"index":1,"description":"Vendor contact name","placeholder":"{{1}}"},{"index":2,"description":"Status update text (already includes the invoice number)","placeholder":"{{2}}"}]'::jsonb,
  status = 'pending',
  updated_at = now()
WHERE template_name = 'vendor_invoice_update_v1';

INSERT INTO public.whatsapp_templates (template_name, content, variables, category, status, is_active, tenant_id)
SELECT
  'vendor_invoice_update_v1',
  'Hi {{1}}, here''s an update on your invoice: {{2}}. Log in to the Vendor Verification Portal to view full details and payment history: https://vendorverification.in-sync.co.in/vendor/portal',
  '[{"index":1,"description":"Vendor contact name","placeholder":"{{1}}"},{"index":2,"description":"Status update text (already includes the invoice number)","placeholder":"{{2}}"}]'::jsonb,
  'UTILITY',
  'pending',
  false,
  'a0000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates WHERE template_name = 'vendor_invoice_update_v1'
);

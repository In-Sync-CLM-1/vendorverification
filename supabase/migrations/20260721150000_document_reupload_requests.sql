-- ============================================================================
-- Let staff flag a single onboarding document as needing a re-upload without
-- rejecting the vendor's whole application. Distinct from 'rejected' so an
-- otherwise-approved vendor stays approved while just this one document is
-- flagged. The vendor is notified by email + WhatsApp (WhatsApp gated on
-- Meta template approval, same pattern as staff_invoice_submitted_v1 /
-- vendor_invoice_update_v1) with a link straight to the re-upload form.
-- ============================================================================

ALTER TYPE public.document_status ADD VALUE IF NOT EXISTS 'reupload_requested';

-- ----------------------------------------------------------------------------
-- Register the WhatsApp utility template locally (pending Meta approval via
-- Exotel, same gating pattern as vendor_invoice_update_v1). The notify
-- function only sends WhatsApp once this row's status is flipped to
-- 'approved'; email goes out regardless.
-- ----------------------------------------------------------------------------
INSERT INTO public.whatsapp_templates (template_name, content, variables, category, status, is_active, tenant_id)
SELECT
  'document_reupload_requested_v1',
  'Hi {{1}}, please re-upload your {{2}}. Reason: {{3}}. Upload it here: {{4}}',
  '[
    {"index":1,"description":"Vendor contact name","placeholder":"{{1}}"},
    {"index":2,"description":"Document type name","placeholder":"{{2}}"},
    {"index":3,"description":"Reason staff gave for the re-upload request","placeholder":"{{3}}"},
    {"index":4,"description":"Direct link to the re-upload form","placeholder":"{{4}}"}
  ]'::jsonb,
  'UTILITY',
  'pending',
  false,
  'a0000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates WHERE template_name = 'document_reupload_requested_v1'
);

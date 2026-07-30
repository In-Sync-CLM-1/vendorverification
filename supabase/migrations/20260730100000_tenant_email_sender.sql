-- ============================================================================
-- Per-tenant notification email sender.
-- Every outbound notification currently sends from the shared
-- "Vendor-Sync <noreply@in-sync.co.in>" address regardless of tenant. A
-- tenant that has verified its own sending domain with Resend can now be
-- given its own from-name/address here; functions fall back to the shared
-- default when a tenant hasn't set one (mirrors the whatsapp_settings
-- tenant-scoping pattern).
-- ============================================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS notification_from_name TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS notification_from_email TEXT;

-- Redefine Marcom verified redefine.in with Resend 2026-07-29; use it for
-- their own vendors' notifications instead of the shared In-Sync address.
UPDATE public.tenants
SET notification_from_name = 'Redefine Marcom',
    notification_from_email = 'noreply@redefine.in'
WHERE id = '467ce2a0-5df8-40a7-81d6-ccdc77b66ce9'
  AND notification_from_email IS NULL;

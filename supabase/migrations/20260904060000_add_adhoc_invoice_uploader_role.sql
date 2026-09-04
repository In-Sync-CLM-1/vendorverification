-- ============================================================================
-- Adhoc invoice uploader role
-- A narrow grant, same shape as 'livecom_uploader' (see
-- 20260828150000_add_livecom_uploader_role.sql): lets a named individual
-- record an invoice for a purchase where the vendor was never verified
-- (or never will be) in this system, without lifting any other permission.
-- Own migration for the same reason as that one — a new enum value can't be
-- referenced in the same transaction it's created in.
-- ============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'adhoc_invoice_uploader';

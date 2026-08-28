-- ============================================================================
-- Livecom uploader role
-- A narrow, separate grant from 'viewer' (see 20260826140000_add_viewer_role.sql):
-- lets RMPL's Livecom team upload an invoice on behalf of a vendor who can't
-- use the vendor portal themselves. It does NOT lift the view-only floor —
-- someone who is 'viewer' + 'livecom_uploader' still can't touch payments,
-- fraud alerts, advance requests, etc. (is_view_only doesn't list this role
-- as an exclusion on purpose). Own migration for the same reason as 'viewer':
-- a new enum value can't be referenced in the same transaction it's created in.
-- ============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'livecom_uploader';

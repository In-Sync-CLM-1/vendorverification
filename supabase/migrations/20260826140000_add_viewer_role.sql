-- ============================================================================
-- Viewer role
-- For staff who should be able to see everything in their tenant but never
-- create/approve/edit/reveal anything (e.g. RMPL's Livecom/CSBD teams getting
-- SSO into the Redefine org). Added in its own migration because a new enum
-- value can't be referenced in the same transaction it's created in (same
-- pattern as the earlier 'platform_admin'/'accounts' additions).
-- ============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

-- ============================================================================
-- Project assignment for advance requests now comes from RMPL (the org's
-- separate project-tracking Supabase project), read live via the
-- list-rmpl-projects edge function — not a locally maintained list. Drop the
-- local internal_projects lookup and its FK; keep project_id as a plain
-- reference to RMPL's projects.id (no FK possible across databases) plus a
-- denormalized project_name snapshot so history reads fine even if RMPL's
-- project is later renamed or removed.
-- ============================================================================

ALTER TABLE public.vendor_advance_requests
  DROP CONSTRAINT IF EXISTS vendor_advance_requests_project_id_fkey;

ALTER TABLE public.vendor_advance_requests
  ADD COLUMN IF NOT EXISTS project_name TEXT;

DROP TABLE IF EXISTS public.internal_projects;

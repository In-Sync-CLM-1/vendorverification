-- Standing fallback approver per RMPL team: when a project's owner belongs to a
-- team listed here and has no portal login, approvals go to this person instead
-- of the Accounts fallback. team_pattern is matched as a case-insensitive
-- substring of the team name (team names get renamed -- never exact match).
CREATE TABLE IF NOT EXISTS public.pi_team_fallback_approvers (
  tenant_id      UUID NOT NULL,
  team_pattern   TEXT NOT NULL,
  approver_email TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, team_pattern)
);
ALTER TABLE public.pi_team_fallback_approvers ENABLE ROW LEVEL SECURITY;
-- No policies: read by the list-rmpl-projects function with the service role.

-- DemandCOM owners without a portal login go to Jatinder Mahajan.
INSERT INTO public.pi_team_fallback_approvers (tenant_id, team_pattern, approver_email)
SELECT t.id, 'demandcom', 'jatinder.mahajan@redefine.in'
FROM public.tenants t
WHERE t.name = 'REDEFINE MARCOM PRIVATE LIMITED'
ON CONFLICT (tenant_id, team_pattern) DO UPDATE SET approver_email = EXCLUDED.approver_email;

-- The two per-person entries this rule replaces.
DELETE FROM public.pi_approver_overrides
WHERE owner_email IN ('harman.kaur@redefinemarcom.in', 'bhavna@redefine.in');

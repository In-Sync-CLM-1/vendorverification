-- Move PI / quotation approval for a given RMPL project owner to someone else
-- without changing project ownership in RMPL (e.g. an owner who has left).
CREATE TABLE IF NOT EXISTS public.pi_approver_overrides (
  tenant_id      UUID NOT NULL,
  owner_email    TEXT NOT NULL,
  approver_email TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_email)
);
ALTER TABLE public.pi_approver_overrides ENABLE ROW LEVEL SECURITY;
-- No policies: read by the list-rmpl-projects function with the service role.

-- Kumar Niraj has left: his projects' approvals go to Sainath Singh.
INSERT INTO public.pi_approver_overrides (tenant_id, owner_email, approver_email)
SELECT t.id, 'kumar.niraj@redefine.in', 'sainath.singh@redefine.in'
FROM public.tenants t
WHERE t.name = 'REDEFINE MARCOM PRIVATE LIMITED'
ON CONFLICT (tenant_id, owner_email) DO UPDATE SET approver_email = EXCLUDED.approver_email;

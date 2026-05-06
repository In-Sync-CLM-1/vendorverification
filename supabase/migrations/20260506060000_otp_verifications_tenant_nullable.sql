-- public_otp_verifications.tenant_id must be nullable.
--
-- Rationale: OrgRegistration uses public OTPs to verify a new admin's email/phone
-- BEFORE the tenant is created. There is no tenant_id to attach yet. The previous
-- send-public-otp implementation worked around this by silently inserting under
-- "the first tenant in the DB", which mis-attributed pre-signup OTPs to whichever
-- tenant happened to be first. We removed that fallback in the edge function;
-- this column must be nullable so legitimate org-registration OTPs are not blocked.
ALTER TABLE public.public_otp_verifications ALTER COLUMN tenant_id DROP NOT NULL;

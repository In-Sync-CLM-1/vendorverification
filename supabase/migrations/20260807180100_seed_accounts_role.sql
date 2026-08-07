-- ============================================================================
-- Seed the Accounts role onto the two staff members already handling
-- vendor payments today (Manoj Mishra, Inderpreet Singh), so Phase 1 of the
-- PI -> PO -> Advance -> Invoice -> Payment flow has real Accounts users to
-- route to before the rest of the flow (PO issuance, advance processing,
-- payment recording) is gated to this role in later phases.
-- Looked up by name rather than a hardcoded user id so this stays portable
-- across environments; a no-op if either name isn't found.
-- ============================================================================

INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT p.user_id, p.tenant_id, 'accounts'::public.app_role
FROM public.profiles p
WHERE p.full_name IN ('Manoj Mishra', 'Inderpreet Singh')
ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

-- PI / quotation (and advance-request) approvals are routed to the RMPL project
-- owner by matching their RMPL email to a staff account here. Owners reach this
-- portal through RMPL's one-click sign-in, which keys on the account's LOGIN
-- email (auth.users.email). The lookup used only the profile's encrypted email,
-- and for those accounts the stored value is a masked placeholder, so it matched
-- nobody and every PI fell back to the default approver (Accounts).
-- Match on the login email first; keep the profile email as a second source.

CREATE OR REPLACE FUNCTION public.find_staff_by_emails(p_emails TEXT[])
RETURNS TABLE (user_id UUID, matched_email TEXT, full_name TEXT, tenant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (m.needle, m.user_id) m.user_id, m.needle, m.full_name, m.tenant_id
  FROM (
    SELECT p.user_id, lower(e.needle) AS needle, p.full_name, p.tenant_id
    FROM unnest(p_emails) AS e(needle)
    JOIN auth.users u ON lower(u.email) = lower(e.needle)
    JOIN public.profiles p ON p.user_id = u.id
    WHERE p.is_active = true
    UNION
    SELECT p.user_id, lower(e.needle), p.full_name, p.tenant_id
    FROM unnest(p_emails) AS e(needle)
    JOIN public.profiles p
      ON lower(public.decrypt_pii(p.email_encrypted)) = lower(e.needle)
    WHERE p.user_id IS NOT NULL AND p.is_active = true
  ) m;
END;
$$;
REVOKE ALL ON FUNCTION public.find_staff_by_emails(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_staff_by_emails(TEXT[]) TO service_role;

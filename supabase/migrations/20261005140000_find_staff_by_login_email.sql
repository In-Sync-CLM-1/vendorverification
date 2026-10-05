-- PI / quotation (and advance-request) approvals are routed to the RMPL project
-- owner by matching their RMPL (OPM) email to the staff login here. Owners reach
-- this portal through OPM's one-click sign-in, which keys on the login email
-- (auth.users.email), so that is the only list to check. The old lookup read the
-- profile's encrypted email, which is a masked placeholder for those accounts, so
-- it matched nobody and every PI fell back to the default approver (Accounts).

CREATE OR REPLACE FUNCTION public.find_staff_by_emails(p_emails TEXT[])
RETURNS TABLE (user_id UUID, matched_email TEXT, full_name TEXT, tenant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.user_id, lower(e.needle), p.full_name, p.tenant_id
  FROM unnest(p_emails) AS e(needle)
  JOIN auth.users u ON lower(u.email) = lower(e.needle)
  JOIN public.profiles p ON p.user_id = u.id
  WHERE p.is_active = true;
END;
$$;
REVOKE ALL ON FUNCTION public.find_staff_by_emails(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_staff_by_emails(TEXT[]) TO service_role;

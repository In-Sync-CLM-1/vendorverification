-- Staff email addresses are stored masked in profiles.email (the plaintext
-- column is masked by the PII trigger); the real value only exists encrypted
-- in profiles.email_encrypted. Any lookup that matches an outside system's
-- email against profiles.email therefore never finds anyone — which is why
-- RMPL project owners could never be resolved and PI/Quotation submission was
-- blocked on every project.
--
-- SECURITY DEFINER so the decryption key stays server-side; returns only the
-- ids needed for routing, never a decrypted address.
-- Dropped first: the return signature changed after the first live apply, and
-- CREATE OR REPLACE cannot alter a function's return type.
DROP FUNCTION IF EXISTS public.find_staff_by_emails(TEXT[]);

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
  JOIN public.profiles p
    ON lower(public.decrypt_pii(p.email_encrypted)) = lower(e.needle)
  WHERE p.user_id IS NOT NULL
    AND p.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.find_staff_by_emails(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_staff_by_emails(TEXT[]) TO service_role;

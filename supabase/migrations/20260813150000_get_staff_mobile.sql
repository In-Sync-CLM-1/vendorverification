-- Staff mobile numbers are masked in profiles.phone; the real number only
-- exists encrypted in profiles.phone_encrypted. Notification senders therefore
-- cannot read a usable number off the table directly — reading profiles.phone
-- yields NULL and the WhatsApp send is silently skipped.
--
-- SECURITY DEFINER so the decryption key stays server-side, service_role only.
CREATE OR REPLACE FUNCTION public.get_staff_mobile(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.decrypt_pii(p.phone_encrypted)
    FROM public.profiles p
   WHERE p.user_id = p_user_id
     AND p.is_active = true
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_staff_mobile(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_mobile(UUID) TO service_role;

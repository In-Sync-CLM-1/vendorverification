-- Restore the standard Supabase role grants on the public schema.
--
-- At some point the anon / authenticated / service_role roles lost USAGE on
-- schema public and all table/sequence/routine privileges (only the internal
-- `postgres` role retained access). This made EVERY PostgREST request from the
-- app fail with `42501: permission denied for schema public`, including the
-- post-login profile lookup in useAuth.determineUserType(). The visible symptom
-- was the "Account setup incomplete" screen for an otherwise-valid staff account.
--
-- Row-level security is enabled on every public table, so these grants do not
-- widen row access — RLS remains the gatekeeper. This migration is idempotent
-- and safe to replay.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

-- Ensure objects created later (by the postgres role) also carry these grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;

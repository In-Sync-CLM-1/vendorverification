-- Raise the document/file upload ceiling from 10 MB to 20 MB.
-- The vendor-documents bucket was still capped at 5 MB, which silently rejected
-- anything larger even though the edge functions allowed 10 MB.

-- Already applied out-of-band; guarded so a storage-schema privilege error can
-- never abort the deploy job before the edge functions ship.
DO $$
BEGIN
  UPDATE storage.buckets
  SET file_size_limit = 20971520 -- 20 MB
  WHERE id = 'vendor-documents';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'skipping storage.buckets update (insufficient privilege)';
END $$;

-- document_types.max_file_size_mb is the value shown to admins/vendors as the
-- per-document-type ceiling; keep it in step with what is actually enforced.
ALTER TABLE public.document_types ALTER COLUMN max_file_size_mb SET DEFAULT 20;

UPDATE public.document_types
SET max_file_size_mb = 20
WHERE max_file_size_mb IS NULL OR max_file_size_mb < 20;

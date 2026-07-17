-- Restore storage.objects RLS policies for the vendor-documents bucket.
-- These existed in migration 20260123023353 but were lost during the
-- 2026-07-08 project cutover (schema clone did not carry storage policies;
-- baseline-migrations.mjs marked the migration as applied without re-running it).
-- With zero policies, RLS defaults to deny-all for authenticated clients,
-- so createSignedUrl() silently failed for every vendor/staff document view
-- (service_role uploads via edge functions were unaffected, which is why
-- new documents kept landing in the table while nobody could see them).

DROP POLICY IF EXISTS "Vendors can upload their own documents" ON storage.objects;
CREATE POLICY "Vendors can upload their own documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vendor-documents'
  AND (storage.foldername(name))[1] = public.get_vendor_id(auth.uid())::text
);

DROP POLICY IF EXISTS "Vendors can view their own documents" ON storage.objects;
CREATE POLICY "Vendors can view their own documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND (
    (storage.foldername(name))[1] = public.get_vendor_id(auth.uid())::text
    OR public.is_internal_staff(auth.uid())
  )
);

DROP POLICY IF EXISTS "Vendors can update their own documents" ON storage.objects;
CREATE POLICY "Vendors can update their own documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND (storage.foldername(name))[1] = public.get_vendor_id(auth.uid())::text
);

DROP POLICY IF EXISTS "Vendors can delete their own documents" ON storage.objects;
CREATE POLICY "Vendors can delete their own documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND (storage.foldername(name))[1] = public.get_vendor_id(auth.uid())::text
);

DROP POLICY IF EXISTS "Staff can view all vendor documents" ON storage.objects;
CREATE POLICY "Staff can view all vendor documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND public.is_internal_staff(auth.uid())
);

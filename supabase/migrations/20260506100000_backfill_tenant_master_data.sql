-- Backfill vendor_categories, document_types, and category_documents for any
-- tenant that currently has no categories. Newly-registered tenants prior to
-- the register-organization seeding fix had empty master data, which made the
-- "Invite Vendor" category dropdown blank.
--
-- The default tenant a0000000-0000-0000-0000-000000000001 acts as the source
-- of truth for the master-data templates.

DO $$
DECLARE
  default_tenant CONSTANT UUID := 'a0000000-0000-0000-0000-000000000001';
  t RECORD;
  category_map JSONB;
  doctype_map JSONB;
BEGIN
  FOR t IN
    SELECT id FROM public.tenants
    WHERE id <> default_tenant
      AND NOT EXISTS (
        SELECT 1 FROM public.vendor_categories vc WHERE vc.tenant_id = tenants.id
      )
  LOOP
    -- Copy vendor_categories
    WITH inserted AS (
      INSERT INTO public.vendor_categories (tenant_id, name, description, is_active)
      SELECT t.id, vc.name, vc.description, vc.is_active
      FROM public.vendor_categories vc
      WHERE vc.tenant_id = default_tenant
      RETURNING id, name
    )
    SELECT jsonb_object_agg(name, id) INTO category_map FROM inserted;

    -- Copy document_types (only those missing for this tenant)
    WITH inserted AS (
      INSERT INTO public.document_types
        (tenant_id, name, description, sample_url, accepted_formats, max_file_size_mb, has_expiry)
      SELECT t.id, dt.name, dt.description, dt.sample_url, dt.accepted_formats, dt.max_file_size_mb, dt.has_expiry
      FROM public.document_types dt
      WHERE dt.tenant_id = default_tenant
        AND NOT EXISTS (
          SELECT 1 FROM public.document_types dt2
          WHERE dt2.tenant_id = t.id AND dt2.name = dt.name
        )
      RETURNING id, name
    )
    SELECT jsonb_object_agg(name, id) INTO doctype_map FROM inserted;

    -- Build doctype_map from all of this tenant's doc types (in case some
    -- already existed and weren't returned above).
    SELECT jsonb_object_agg(name, id) INTO doctype_map
    FROM public.document_types WHERE tenant_id = t.id;

    -- Copy category_documents using the new tenant's IDs
    INSERT INTO public.category_documents
      (tenant_id, category_id, document_type_id, is_mandatory, display_order)
    SELECT
      t.id,
      (category_map ->> vc_src.name)::uuid,
      (doctype_map ->> dt_src.name)::uuid,
      cd.is_mandatory,
      cd.display_order
    FROM public.category_documents cd
    JOIN public.vendor_categories vc_src ON vc_src.id = cd.category_id
    JOIN public.document_types dt_src ON dt_src.id = cd.document_type_id
    WHERE cd.tenant_id = default_tenant
      AND category_map ? vc_src.name
      AND doctype_map ? dt_src.name
    ON CONFLICT (category_id, document_type_id) DO NOTHING;
  END LOOP;
END $$;

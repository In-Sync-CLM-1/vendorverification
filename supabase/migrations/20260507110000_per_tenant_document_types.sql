-- ============================================================================
-- Mirror the per-tenant treatment that vendor_categories got, but for
-- document_types & category_documents. Background:
--
--   * tenant_id was added to document_types in the multi-tenancy migration
--     (20260313100000) and backfilled to the legacy default tenant only.
--   * No subsequent migration seeded document_types per tenant, so any
--     tenant created later has zero doc-types of their own. Their vendors
--     end up with vendor_documents whose document_type_id points to the
--     legacy tenant's row, which RLS then hides — crashing the staff
--     review page.
--
-- This migration:
--   1. Drops the legacy global UNIQUE(name) on document_types.
--   2. Adds UNIQUE(tenant_id, name).
--   3. Picks a "template" tenant (the one with the most doc_types) and
--      backfills its set into every tenant that has zero of its own.
--   4. Adds the same set of category_documents links (matched by
--      category name + doc-type name + tenant) where missing.
--   5. Repoints any vendor_documents whose doc-type lives in a different
--      tenant to the equivalent doc-type (matched by name) inside the
--      vendor's own tenant.
--   6. Adds a trigger to auto-seed doc_types + category_documents on
--      every new tenant insert (runs after the existing categories trigger).
-- ============================================================================

BEGIN;

-- 1. Drop the legacy global UNIQUE on name
ALTER TABLE public.document_types DROP CONSTRAINT IF EXISTS document_types_name_key;

-- 2. Per-tenant UNIQUE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_types_tenant_name_key'
      AND conrelid = 'public.document_types'::regclass
  ) THEN
    ALTER TABLE public.document_types
      ADD CONSTRAINT document_types_tenant_name_key UNIQUE (tenant_id, name);
  END IF;
END $$;

-- 3. Backfill doc_types for any tenant with zero of their own.
--    The template is the tenant currently holding the most doc_types.
WITH template AS (
  SELECT tenant_id
  FROM public.document_types
  GROUP BY tenant_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
),
needs_seed AS (
  SELECT t.id AS tenant_id
  FROM public.tenants t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.document_types dt WHERE dt.tenant_id = t.id
  )
)
INSERT INTO public.document_types
  (tenant_id, name, description, sample_url, accepted_formats, max_file_size_mb, has_expiry)
SELECT
  ns.tenant_id, dt.name, dt.description, dt.sample_url,
  dt.accepted_formats, dt.max_file_size_mb, dt.has_expiry
FROM needs_seed ns
CROSS JOIN public.document_types dt
WHERE dt.tenant_id = (SELECT tenant_id FROM template)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 4. Backfill category_documents links for tenants that just got seeded.
--    Match category by (tenant_id, name) and doc_type by (tenant_id, name)
--    against the template tenant's existing links.
WITH template AS (
  SELECT tenant_id
  FROM public.document_types
  GROUP BY tenant_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
),
template_links AS (
  SELECT vc.name AS cat_name, dt.name AS dt_name,
         cd.is_mandatory, cd.display_order
  FROM public.category_documents cd
  JOIN public.vendor_categories vc ON vc.id = cd.category_id
  JOIN public.document_types dt   ON dt.id = cd.document_type_id
  WHERE vc.tenant_id = (SELECT tenant_id FROM template)
    AND dt.tenant_id = (SELECT tenant_id FROM template)
)
INSERT INTO public.category_documents (category_id, document_type_id, is_mandatory, display_order, tenant_id)
SELECT vc.id, dt.id, tl.is_mandatory, tl.display_order, t.id
FROM public.tenants t
JOIN template_links tl ON true
JOIN public.vendor_categories vc ON vc.tenant_id = t.id AND vc.name = tl.cat_name
JOIN public.document_types    dt ON dt.tenant_id = t.id AND dt.name = tl.dt_name
WHERE t.id <> (SELECT tenant_id FROM template)
ON CONFLICT (category_id, document_type_id) DO NOTHING;

-- 5. Repoint cross-tenant vendor_documents to same-tenant doc_types
UPDATE public.vendor_documents vd
SET document_type_id = same_tenant_dt.id
FROM public.document_types wrong_dt
JOIN public.document_types same_tenant_dt
  ON same_tenant_dt.name = wrong_dt.name
WHERE vd.document_type_id = wrong_dt.id
  AND wrong_dt.tenant_id <> vd.tenant_id
  AND same_tenant_dt.tenant_id = vd.tenant_id;

-- 6. Trigger: auto-seed doc_types + category_documents for every new tenant.
--    Fires AFTER the existing seed_default_vendor_categories trigger so the
--    categories already exist when we link them.
CREATE OR REPLACE FUNCTION public.seed_default_document_types()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_template_tenant
  FROM public.document_types
  WHERE tenant_id <> NEW.id
  GROUP BY tenant_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_template_tenant IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.document_types
    (tenant_id, name, description, sample_url, accepted_formats, max_file_size_mb, has_expiry)
  SELECT NEW.id, dt.name, dt.description, dt.sample_url,
         dt.accepted_formats, dt.max_file_size_mb, dt.has_expiry
  FROM public.document_types dt
  WHERE dt.tenant_id = v_template_tenant
  ON CONFLICT (tenant_id, name) DO NOTHING;

  INSERT INTO public.category_documents (category_id, document_type_id, is_mandatory, display_order, tenant_id)
  SELECT vc.id, dt.id, cd.is_mandatory, cd.display_order, NEW.id
  FROM public.category_documents cd
  JOIN public.vendor_categories vc_template
    ON vc_template.id = cd.category_id AND vc_template.tenant_id = v_template_tenant
  JOIN public.document_types dt_template
    ON dt_template.id = cd.document_type_id AND dt_template.tenant_id = v_template_tenant
  JOIN public.vendor_categories vc
    ON vc.tenant_id = NEW.id AND vc.name = vc_template.name
  JOIN public.document_types dt
    ON dt.tenant_id = NEW.id AND dt.name = dt_template.name
  ON CONFLICT (category_id, document_type_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_document_types ON public.tenants;
CREATE TRIGGER trg_seed_default_document_types
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_document_types();

COMMIT;

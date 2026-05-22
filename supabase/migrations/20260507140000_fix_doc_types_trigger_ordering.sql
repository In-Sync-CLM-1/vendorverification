-- ============================================================================
-- Fix the document-types seed trigger so it fires AFTER the vendor-categories
-- seed trigger on new tenant inserts.
--
-- Postgres fires same-event triggers in alphabetical order by name. Until now:
--   trg_seed_default_document_types       (d)
--   trg_seed_default_vendor_categories    (v)
-- the doc-types trigger ran first, found zero categories for the new tenant,
-- and silently skipped seeding category_documents — leaving brand-new orgs
-- with no required-document mappings (and an empty "required documents" list
-- when they invited a vendor).
--
-- Rename the doc-types trigger so it sorts after the categories trigger, then
-- backfill category_documents for any tenant that lost its links because of
-- the bug. Healthy tenants are skipped via NOT EXISTS.
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_seed_default_document_types ON public.tenants;

CREATE TRIGGER trg_z_seed_default_document_types
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_document_types();

WITH template AS (
  SELECT tenant_id
  FROM public.category_documents
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
  AND NOT EXISTS (
    SELECT 1 FROM public.category_documents cd2 WHERE cd2.tenant_id = t.id
  )
ON CONFLICT (category_id, document_type_id) DO NOTHING;

COMMIT;

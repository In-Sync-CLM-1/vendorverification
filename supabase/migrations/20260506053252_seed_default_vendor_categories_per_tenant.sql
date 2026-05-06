-- Seed default vendor_categories for every tenant
--
-- Background: vendor_categories.tenant_id was added by 20260313100000_add_multi_tenancy.sql
-- and the SELECT RLS policy filters by tenant. The original 4 categories were backfilled
-- to the default tenant only, so any new organization created via register-organization
-- has zero categories -> empty Category dropdown on "Invite a Vendor".
--
-- Fix:
--   1. Drop the legacy global UNIQUE(name) so two tenants can both have "Supplier".
--   2. Add UNIQUE(tenant_id, name) instead.
--   3. Backfill the 4 defaults for any tenant that currently has zero categories.
--   4. Trigger to auto-seed the same 4 defaults whenever a new tenant is created.

-- 1. Drop legacy global UNIQUE on name (PostgreSQL default constraint name is <table>_<col>_key)
ALTER TABLE public.vendor_categories DROP CONSTRAINT IF EXISTS vendor_categories_name_key;

-- 2. Add per-tenant UNIQUE on (tenant_id, name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vendor_categories_tenant_name_key'
      AND conrelid = 'public.vendor_categories'::regclass
  ) THEN
    ALTER TABLE public.vendor_categories
      ADD CONSTRAINT vendor_categories_tenant_name_key UNIQUE (tenant_id, name);
  END IF;
END $$;

-- 3. Backfill: insert the 4 default categories for any tenant that has zero categories
INSERT INTO public.vendor_categories (tenant_id, name, description, is_active)
SELECT t.id, c.name, c.description, true
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('Supplier',         'Supplier of goods'),
    ('Service Provider', 'Provider of services'),
    ('Contractor',       'Contractor for project work'),
    ('Channel Partner',  'Channel partner / reseller')
) AS c(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.vendor_categories vc WHERE vc.tenant_id = t.id
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 4. Trigger function: auto-seed default categories for every new tenant
CREATE OR REPLACE FUNCTION public.seed_default_vendor_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vendor_categories (tenant_id, name, description, is_active)
  VALUES
    (NEW.id, 'Supplier',         'Supplier of goods',          true),
    (NEW.id, 'Service Provider', 'Provider of services',       true),
    (NEW.id, 'Contractor',       'Contractor for project work', true),
    (NEW.id, 'Channel Partner',  'Channel partner / reseller', true)
  ON CONFLICT (tenant_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_vendor_categories ON public.tenants;
CREATE TRIGGER trg_seed_default_vendor_categories
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_vendor_categories();

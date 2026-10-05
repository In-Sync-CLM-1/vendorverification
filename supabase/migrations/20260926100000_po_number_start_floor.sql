-- Per-tenant, per-FY starting number for PO numbering. When a row exists, the
-- next PO number is GREATEST(MAX+1, start_number); no row = unchanged behaviour.
CREATE TABLE IF NOT EXISTS public.po_number_start (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fy_label TEXT NOT NULL,
  start_number INTEGER NOT NULL CHECK (start_number >= 1),
  PRIMARY KEY (tenant_id, fy_label)
);
ALTER TABLE public.po_number_start ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy_start INT;
  v_fy_label TEXT;
  v_seq INT;
  v_floor INT;
BEGIN
  IF NEW.po_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_fy_start := CASE WHEN EXTRACT(MONTH FROM NEW.po_date) >= 4
    THEN EXTRACT(YEAR FROM NEW.po_date)::INT
    ELSE EXTRACT(YEAR FROM NEW.po_date)::INT - 1
  END;
  v_fy_label := v_fy_start::TEXT || '-' || LPAD(((v_fy_start + 1) % 100)::TEXT, 2, '0');

  SELECT COALESCE(MAX(CAST(SPLIT_PART(po_number, '/', 1) AS INTEGER)), 0) + 1
  INTO v_seq
  FROM public.purchase_orders
  WHERE tenant_id = NEW.tenant_id AND po_number LIKE '%/' || v_fy_label;

  SELECT start_number INTO v_floor
  FROM public.po_number_start
  WHERE tenant_id = NEW.tenant_id AND fy_label = v_fy_label;
  v_seq := GREATEST(v_seq, COALESCE(v_floor, 1));

  NEW.po_number := v_seq::TEXT || '/' || v_fy_label;
  RETURN NEW;
END;
$$;

-- Redefine Marcom: PO numbers run from 200/2026-27 onwards.
INSERT INTO public.po_number_start (tenant_id, fy_label, start_number)
VALUES ('467ce2a0-5df8-40a7-81d6-ccdc77b66ce9', '2026-27', 200)
ON CONFLICT (tenant_id, fy_label) DO UPDATE SET start_number = EXCLUDED.start_number;

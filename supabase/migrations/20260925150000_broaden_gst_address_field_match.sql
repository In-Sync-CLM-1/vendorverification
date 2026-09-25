-- The GST-cert address auto-fill added in 20260925140000 only matched the
-- exact label "Address of Principal Place of Business", but the AI extractor
-- doesn't use one fixed label -- real analyses came back as "Address",
-- "Principal Place of Business Address", etc. Broaden to any field_name
-- containing "address" (still scoped to document_type_detected = 'GST
-- Certificate', so nothing from an unrelated doc type can match).

CREATE OR REPLACE FUNCTION public.backfill_vendor_address_from_gst_cert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id UUID;
  v_address TEXT;
BEGIN
  IF NEW.analysis_status <> 'completed' OR NEW.document_type_detected <> 'GST Certificate' THEN
    RETURN NEW;
  END IF;

  SELECT elem->>'extracted_value' INTO v_address
  FROM jsonb_array_elements(NEW.extracted_data) elem
  WHERE elem->>'field_name' ILIKE '%address%'
    AND coalesce(elem->>'extracted_value', '') <> ''
  ORDER BY length(elem->>'field_name') DESC
  LIMIT 1;

  IF v_address IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT vendor_id INTO v_vendor_id FROM public.vendor_documents WHERE id = NEW.document_id;
  IF v_vendor_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.vendors
     SET registered_address = v_address
   WHERE id = v_vendor_id
     AND registered_address IS NULL
     AND operational_address IS NULL;

  RETURN NEW;
END;
$$;

-- Re-run the backfill under the broader match for analyses already completed.
UPDATE public.vendors v SET
  registered_address = sub.addr
FROM (
  SELECT DISTINCT ON (vd.vendor_id) vd.vendor_id, elem->>'extracted_value' AS addr
  FROM public.vendor_documents vd
  JOIN public.document_analyses da ON da.document_id = vd.id
  CROSS JOIN LATERAL jsonb_array_elements(da.extracted_data) elem
  WHERE da.analysis_status = 'completed'
    AND da.document_type_detected = 'GST Certificate'
    AND elem->>'field_name' ILIKE '%address%'
    AND coalesce(elem->>'extracted_value', '') <> ''
  ORDER BY vd.vendor_id, length(elem->>'field_name') DESC, da.created_at DESC
) sub
WHERE v.id = sub.vendor_id
  AND v.registered_address IS NULL
  AND v.operational_address IS NULL;

UPDATE public.purchase_orders po SET
  vendor_address = coalesce(po.vendor_address, (SELECT v.registered_address FROM public.vendors v WHERE v.id = po.vendor_id))
WHERE po.vendor_address IS NULL;

-- Two more real gaps found chasing the same address-backfill problem:
-- (1) document_type_detected comes back as variants like "GST Certificate
--     (Form GST REG-06)" or "GST Certificate (GST REG-06)", not always the
--     literal string "GST Certificate" -- the exact-match trigger silently
--     skipped those.
-- (2) some GST Certificates get extracted as separate address COMPONENTS
--     (Building No./Flat No., Road/Street, City/Town/Village, District,
--     State, PIN Code) with no single field whose name contains "address"
--     at all -- there's nothing for the ILIKE '%address%' match to find.
-- Shared helper used by both the trigger and the one-time backfill so the
-- two never drift apart.

CREATE OR REPLACE FUNCTION public.extract_gst_address(p_extracted_data JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_address TEXT;
  v_label TEXT;
  v_parts TEXT[] := ARRAY[]::TEXT[];
  v_val TEXT;
BEGIN
  SELECT elem->>'extracted_value' INTO v_address
  FROM jsonb_array_elements(p_extracted_data) elem
  WHERE elem->>'field_name' ILIKE '%address%'
    AND coalesce(elem->>'extracted_value', '') <> ''
  ORDER BY length(elem->>'field_name') DESC
  LIMIT 1;

  IF v_address IS NOT NULL THEN
    RETURN v_address;
  END IF;

  -- Fallback: compose from known address-component labels, in a sensible
  -- reading order, skipping whichever ones this particular document didn't
  -- surface.
  FOREACH v_label IN ARRAY ARRAY[
    'Floor No.', 'Building No./Flat No.', 'Building Number/Flat Number',
    'Name of Premises/Building', 'Name Of Premises/Building',
    'Road/Street', 'Street', 'Locality/Sub Locality',
    'City/Town/Village', 'District', 'State', 'PIN Code'
  ]
  LOOP
    SELECT elem->>'extracted_value' INTO v_val
    FROM jsonb_array_elements(p_extracted_data) elem
    WHERE elem->>'field_name' = v_label
      AND coalesce(elem->>'extracted_value', '') <> ''
    LIMIT 1;
    IF v_val IS NOT NULL THEN
      v_parts := v_parts || v_val;
    END IF;
  END LOOP;

  IF array_length(v_parts, 1) >= 3 THEN
    RETURN array_to_string(v_parts, ', ');
  END IF;

  RETURN NULL;
END;
$$;

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
  IF NEW.analysis_status <> 'completed' OR NEW.document_type_detected NOT ILIKE '%GST Certificate%' THEN
    RETURN NEW;
  END IF;

  v_address := public.extract_gst_address(NEW.extracted_data);
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

-- Re-run the backfill under both fixes for analyses already completed.
UPDATE public.vendors v SET
  registered_address = sub.addr
FROM (
  SELECT DISTINCT ON (vd.vendor_id) vd.vendor_id,
         public.extract_gst_address(da.extracted_data) AS addr
  FROM public.vendor_documents vd
  JOIN public.document_analyses da ON da.document_id = vd.id
  WHERE da.analysis_status = 'completed'
    AND da.document_type_detected ILIKE '%GST Certificate%'
    AND public.extract_gst_address(da.extracted_data) IS NOT NULL
  ORDER BY vd.vendor_id, da.created_at DESC
) sub
WHERE v.id = sub.vendor_id
  AND v.registered_address IS NULL
  AND v.operational_address IS NULL
  AND sub.addr IS NOT NULL;

UPDATE public.purchase_orders po SET
  vendor_address = coalesce(po.vendor_address, (SELECT v.registered_address FROM public.vendors v WHERE v.id = po.vendor_id))
WHERE po.vendor_address IS NULL;

-- User's own suggestion: don't limit the address backfill to the GST
-- Certificate -- several vendors have a real business address sitting on
-- another already-analyzed document instead (Udyam/MSME Registration
-- Certificate's "Official Address of Enterprise", a Gumasta/Trade License's
-- "Address", a Certificate of Incorporation's "Mailing Address", even a
-- self-declaration letter for a vendor with no GST registration at all).
-- Drop the document_type_detected restriction entirely and rely on the
-- field-name safety filter instead -- excluding "Recipient"/"Bank"/"Branch"/
-- "Cheque" fields keeps this from ever picking up someone else's address
-- (a bank's branch, a declaration's addressee, etc.) off an unrelated doc.
-- Also broadens the component-fallback label set: Udyam certs use their own
-- label variants ("Flat/Door/Block No.", "Village/Town", "Road/Street/Lane")
-- that didn't match the GST-cert-specific list from 20260925160000.

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
    AND elem->>'field_name' NOT ILIKE '%addressed%'
    AND elem->>'field_name' NOT ILIKE '%recipient%'
    AND elem->>'field_name' NOT ILIKE '%bank%'
    AND elem->>'field_name' NOT ILIKE '%branch%'
    AND elem->>'field_name' NOT ILIKE '%cheque%'
    AND coalesce(elem->>'extracted_value', '') <> ''
  ORDER BY length(elem->>'field_name') DESC
  LIMIT 1;

  IF v_address IS NOT NULL THEN
    RETURN v_address;
  END IF;

  FOREACH v_label IN ARRAY ARRAY[
    'Floor No.', 'Building No./Flat No.', 'Building Number/Flat Number', 'Flat/Door/Block No.',
    'Name of Premises/Building', 'Name Of Premises/Building', 'Premises/Building',
    'Road/Street', 'Street', 'Road/Street/Lane', 'Locality/Sub Locality',
    'City/Town/Village', 'Village/Town', 'City',
    'District', 'State', 'PIN Code', 'Pin'
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
  IF NEW.analysis_status <> 'completed' THEN
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

-- Re-run the backfill across every completed analysis of every document
-- type, preferring the vendor's most recently analyzed usable document.
UPDATE public.vendors v SET
  registered_address = sub.addr
FROM (
  SELECT DISTINCT ON (vd.vendor_id) vd.vendor_id,
         public.extract_gst_address(da.extracted_data) AS addr
  FROM public.vendor_documents vd
  JOIN public.document_analyses da ON da.document_id = vd.id
  WHERE da.analysis_status = 'completed'
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

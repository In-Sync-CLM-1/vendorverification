-- Vendor "Address" has been blank on 60 of 72 approved vendors -- not
-- because it isn't known, but because it was never wired anywhere. Every
-- vendor's GST Certificate is already AI-analyzed at upload (analyze-document
-- edge fn) and reliably extracts "Address of Principal Place of Business"
-- into document_analyses.extracted_data -- it just never made it back onto
-- vendors.registered_address, which is what the PO (and everything else)
-- actually reads. Close the loop both ways: backfill every vendor this can
-- fix today, and auto-fill it from here on whenever a GST Certificate
-- analysis completes.

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
  WHERE elem->>'field_name' = 'Address of Principal Place of Business'
    AND coalesce(elem->>'extracted_value', '') <> ''
  LIMIT 1;

  IF v_address IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT vendor_id INTO v_vendor_id FROM public.vendor_documents WHERE id = NEW.document_id;
  IF v_vendor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Never overwrite an address the vendor or staff already has on file --
  -- this only fills a gap, same additive-only rule as the rest of this app.
  UPDATE public.vendors
     SET registered_address = v_address
   WHERE id = v_vendor_id
     AND registered_address IS NULL
     AND operational_address IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backfill_vendor_address_from_gst_cert ON public.document_analyses;
CREATE TRIGGER trg_backfill_vendor_address_from_gst_cert
  AFTER INSERT OR UPDATE ON public.document_analyses
  FOR EACH ROW EXECUTE FUNCTION public.backfill_vendor_address_from_gst_cert();

-- One-time backfill for every vendor this can already fix from an existing,
-- already-completed GST Certificate analysis.
UPDATE public.vendors v SET
  registered_address = sub.addr
FROM (
  SELECT DISTINCT ON (vd.vendor_id) vd.vendor_id, elem->>'extracted_value' AS addr
  FROM public.vendor_documents vd
  JOIN public.document_analyses da ON da.document_id = vd.id
  CROSS JOIN LATERAL jsonb_array_elements(da.extracted_data) elem
  WHERE da.analysis_status = 'completed'
    AND da.document_type_detected = 'GST Certificate'
    AND elem->>'field_name' = 'Address of Principal Place of Business'
    AND coalesce(elem->>'extracted_value', '') <> ''
  ORDER BY vd.vendor_id, da.created_at DESC
) sub
WHERE v.id = sub.vendor_id
  AND v.registered_address IS NULL
  AND v.operational_address IS NULL;

-- A PO snapshots vendor_address at issuance time, so any PO issued before
-- this backfill is still blank even though the vendor record is now fixed --
-- carry the fix through to already-issued POs too.
UPDATE public.purchase_orders po SET
  vendor_address = coalesce(po.vendor_address, (SELECT v.registered_address FROM public.vendors v WHERE v.id = po.vendor_id))
WHERE po.vendor_address IS NULL;

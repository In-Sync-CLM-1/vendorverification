-- The GST/PAN/bank duplicate-detection trigger ran AFTER encrypt_vendor_pii_trigger,
-- which already nulls NEW.gst_number/pan_number/bank_account_number/bank_ifsc before
-- detect_vendor_duplicates() ever sees them, so its "IS NOT NULL" checks always failed
-- and no fraud_alerts were ever raised. Move it to BEFORE (with a name that sorts
-- ahead of "encrypt_vendor_pii_trigger" alphabetically, since same-timing triggers
-- fire in name order) and compare against decrypted values of existing rows instead
-- of their (also-nulled) plaintext columns.

DROP TRIGGER IF EXISTS trg_detect_vendor_duplicates ON public.vendors;

CREATE OR REPLACE FUNCTION public.detect_vendor_duplicates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tenant_id UUID;
  match RECORD;
BEGIN
  v_tenant_id := NEW.tenant_id;
  IF v_tenant_id IS NULL THEN
    v_tenant_id := 'a0000000-0000-0000-0000-000000000001';
  END IF;

  IF NEW.gst_number IS NOT NULL AND NEW.gst_number != '' THEN
    FOR match IN
      SELECT id, company_name FROM public.vendors
      WHERE id != NEW.id
        AND current_status NOT IN ('rejected', 'deactivated', 'consent_withdrawn')
        AND decrypt_pii(gst_number_encrypted) = NEW.gst_number
    LOOP
      INSERT INTO public.fraud_alerts (vendor_id, alert_type, severity, title, description, details, tenant_id)
      VALUES (
        NEW.id, 'duplicate_gst', 'critical', 'Duplicate GST Number Detected',
        format('GST number %s is already registered with another vendor.', NEW.gst_number),
        jsonb_build_object('matching_vendor_id', match.id, 'matching_vendor_name', match.company_name, 'matching_value', NEW.gst_number),
        v_tenant_id
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  IF NEW.pan_number IS NOT NULL AND NEW.pan_number != '' THEN
    FOR match IN
      SELECT id, company_name FROM public.vendors
      WHERE id != NEW.id
        AND current_status NOT IN ('rejected', 'deactivated', 'consent_withdrawn')
        AND decrypt_pii(pan_number_encrypted) = NEW.pan_number
    LOOP
      INSERT INTO public.fraud_alerts (vendor_id, alert_type, severity, title, description, details, tenant_id)
      VALUES (
        NEW.id, 'duplicate_pan', 'critical', 'Duplicate PAN Number',
        format('PAN number %s is registered with another vendor.', NEW.pan_number),
        jsonb_build_object('matching_vendor_id', match.id, 'matching_vendor_name', match.company_name, 'matching_value', NEW.pan_number),
        v_tenant_id
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  IF NEW.bank_account_number IS NOT NULL AND NEW.bank_account_number != '' AND NEW.bank_ifsc IS NOT NULL THEN
    FOR match IN
      SELECT id, company_name FROM public.vendors
      WHERE id != NEW.id
        AND current_status NOT IN ('rejected', 'deactivated', 'consent_withdrawn')
        AND decrypt_pii(bank_account_number_encrypted) = NEW.bank_account_number
        AND decrypt_pii(bank_ifsc_encrypted) = NEW.bank_ifsc
    LOOP
      INSERT INTO public.fraud_alerts (vendor_id, alert_type, severity, title, description, details, tenant_id)
      VALUES (
        NEW.id, 'duplicate_bank', 'high', 'Duplicate Bank Account',
        format('Bank account at %s is already linked to another vendor.', NEW.bank_ifsc),
        jsonb_build_object('matching_vendor_id', match.id, 'matching_vendor_name', match.company_name, 'matching_value', format('%s - %s', NEW.bank_ifsc, right(NEW.bank_account_number, 4))),
        v_tenant_id
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- "aaa_" prefix so this fires before encrypt_vendor_pii_trigger (same BEFORE/ROW
-- timing fires in trigger-name alphabetical order).
CREATE TRIGGER aaa_detect_vendor_duplicates
  BEFORE INSERT OR UPDATE OF gst_number, pan_number, bank_account_number, bank_ifsc
  ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.detect_vendor_duplicates();

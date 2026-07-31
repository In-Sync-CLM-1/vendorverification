-- When a vendor's overall application is approved, any of their documents
-- that were never individually reviewed (uploaded / under_review /
-- reupload_requested) are swept to 'approved' too. Documents a reviewer
-- explicitly rejected stay rejected — that's a human decision, not silence.

CREATE OR REPLACE FUNCTION public.auto_approve_vendor_documents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.current_status = 'approved' AND (OLD.current_status IS DISTINCT FROM 'approved') THEN
    UPDATE public.vendor_documents
    SET status = 'approved',
        reviewed_at = now(),
        updated_at = now()
    WHERE vendor_id = NEW.id
      AND status NOT IN ('approved', 'rejected');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_approve_vendor_documents ON public.vendors;

CREATE TRIGGER trg_auto_approve_vendor_documents
  AFTER UPDATE OF current_status ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_approve_vendor_documents();

-- Backfill: vendors already sitting at 'approved' before this trigger existed
-- (e.g. Prosync AI Solutions RED-2026-0006) never got their documents flipped.
UPDATE public.vendor_documents vd
SET status = 'approved',
    reviewed_at = now(),
    updated_at = now()
FROM public.vendors v
WHERE vd.vendor_id = v.id
  AND v.current_status = 'approved'
  AND vd.status NOT IN ('approved', 'rejected');

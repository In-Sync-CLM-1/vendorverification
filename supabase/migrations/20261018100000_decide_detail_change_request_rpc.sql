-- ============================================================================
-- Approving a vendor detail-change request silently did nothing for staff
-- who are not admin/approver (e.g. maker, accounts).
--
-- The page applied the change with a plain UPDATE on `vendors`. RLS on
-- `vendors` only lets admin/approver update an approved vendor, so for any
-- other reviewer the UPDATE matched 0 rows WITHOUT an error, and the request
-- was still marked "approved" — the vendor kept their old mobile/email and
-- could not log in with the new one.
--
-- The decision now runs in one SECURITY DEFINER function: it applies the
-- change to the vendor and records the decision in the same transaction, so
-- a request can never be marked approved without the change landing.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decide_vendor_detail_change_request(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_comments TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.vendor_detail_change_requests%ROWTYPE;
  v_updated INT;
BEGIN
  IF auth.uid() IS NULL
     OR NOT is_internal_staff(auth.uid())
     OR is_view_only(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to review change requests';
  END IF;

  SELECT * INTO v_req
  FROM public.vendor_detail_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_req.tenant_id <> get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Change request not found';
  END IF;

  IF v_req.status <> 'pending'::public.detail_change_request_status THEN
    RAISE EXCEPTION 'This request has already been reviewed';
  END IF;

  IF p_approve THEN
    UPDATE public.vendors v
    SET primary_contact_name   = COALESCE(v_req.requested_contact_name, v.primary_contact_name),
        primary_email          = COALESCE(v_req.requested_email, v.primary_email),
        primary_mobile         = COALESCE(v_req.requested_mobile, v.primary_mobile),
        bank_account_number    = COALESCE(v_req.requested_bank_account_number, v.bank_account_number),
        bank_ifsc              = COALESCE(v_req.requested_bank_ifsc, v.bank_ifsc),
        gst_number             = COALESCE(v_req.requested_gst_number, v.gst_number),
        msme_number            = COALESCE(v_req.requested_msme_number, v.msme_number)
    WHERE v.id = v_req.vendor_id
      AND v.tenant_id = v_req.tenant_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'Could not update the vendor record';
    END IF;
  END IF;

  UPDATE public.vendor_detail_change_requests
  SET status = CASE WHEN p_approve THEN 'approved'::public.detail_change_request_status
                    ELSE 'rejected'::public.detail_change_request_status END,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_comments = NULLIF(btrim(COALESCE(p_comments, '')), '')
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_vendor_detail_change_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_vendor_detail_change_request(UUID, BOOLEAN, TEXT) TO authenticated;

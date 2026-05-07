-- ============================================================================
-- Loosen the workflow_history INSERT policy.
--
-- Previously the policy used can_staff_access_vendor(uid, vendor_id), which
-- evaluates the *current* (post-update) status of the vendor. After a status
-- transition the actor frequently no longer satisfies that check (e.g. after
-- an approver approves, the vendor is now in 'approved' and no role's branch
-- in can_staff_access_vendor matches). The status update would succeed but
-- the audit insert that follows would fail with 403, leaving the row updated
-- without a corresponding history entry.
--
-- workflow_history is an audit log. The right constraint is "internal staff in
-- the same tenant, attributing the row to themselves" — not "still has access
-- to the vendor in its post-update state".
-- ============================================================================

DROP POLICY IF EXISTS "Staff can insert history" ON public.workflow_history;
CREATE POLICY "Staff can insert history"
  ON public.workflow_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_internal_staff(auth.uid())
    AND tenant_id = public.get_user_tenant_id(auth.uid())
    AND action_by = auth.uid()
  );

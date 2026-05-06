-- Delete three specific user accounts at the operator's request.
-- Removing from auth.users cascades to profiles, user_roles, vendor_users,
-- and notifications (all declared ON DELETE CASCADE on auth.users).
-- Non-cascading FKs (workflow_history.action_by, workflow_assignments.assigned_to,
-- vendor_documents.reviewed_by) are nulled / cleared first so the delete succeeds.

DO $$
DECLARE
  target_emails CONSTANT TEXT[] := ARRAY[
    'amina.mansuri20@gmail.com',
    'pinkymansuri1@gmail.com',
    'insyncclm955@gmail.com'
  ];
  target_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(id) INTO target_ids
  FROM auth.users
  WHERE email = ANY(target_emails);

  IF target_ids IS NULL OR array_length(target_ids, 1) = 0 THEN
    RAISE NOTICE 'No matching users found for: %', target_emails;
    RETURN;
  END IF;

  RAISE NOTICE 'Deleting % user(s): %', array_length(target_ids, 1), target_ids;

  -- Clear non-cascading references that would otherwise block the delete.
  UPDATE public.vendor_documents
     SET reviewed_by = NULL
   WHERE reviewed_by = ANY(target_ids);

  DELETE FROM public.workflow_history
   WHERE action_by = ANY(target_ids);

  DELETE FROM public.workflow_assignments
   WHERE assigned_to = ANY(target_ids);

  -- Cascading delete; auth.users FK cascades handle profiles, user_roles,
  -- vendor_users, notifications, etc.
  DELETE FROM auth.users
   WHERE id = ANY(target_ids);
END $$;

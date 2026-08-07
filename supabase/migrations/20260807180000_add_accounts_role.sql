-- ============================================================================
-- Accounts role
-- Mirrors the Accounts/Admin split used by the sibling "expense" app's
-- Project Expense flow: once a Project Owner approves something tied to an
-- RMPL project, the Accounts team takes it from there (PO issuance, advance
-- processing, payment/adjustment). Added in its own migration because a new
-- enum value can't be referenced in the same transaction it's created in
-- (same pattern as the earlier 'platform_admin' addition).
-- ============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accounts';

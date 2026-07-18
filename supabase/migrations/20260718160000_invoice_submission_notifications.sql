-- ============================================================================
-- Invoice-submitted notifications: email + WhatsApp to tenant approvers with
-- one-click Approve/Reject links, plus an in-app notification. The link
-- target is invoice-approval-action (public edge function, token-authed).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- One row per (invoice, notified approver). Only the SHA-256 hash of the
-- token is stored — matches the api_keys.key_hash pattern used elsewhere.
-- Single-use: used_at is set the first time the link is actioned, and any
-- later click (by this or another approver, once the invoice has moved off
-- submitted/under_review) is rejected.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.vendor_invoices(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  staff_user_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  used_at TIMESTAMPTZ,
  used_action TEXT CHECK (used_action IN ('approved', 'rejected')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_action_tokens_token_hash ON public.invoice_action_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_invoice_action_tokens_invoice ON public.invoice_action_tokens(invoice_id);

-- Service-role only (edge functions) — no client ever reads/writes this table directly.
ALTER TABLE public.invoice_action_tokens ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Register the WhatsApp utility template locally (pending Meta approval via
-- Exotel, same gating pattern as vendor_invoice_update_v1). Two URL buttons:
-- each has its own static base URL registered with Meta, with the token as
-- the one dynamic suffix. The notify function only sends WhatsApp once this
-- row's status is flipped to 'approved'.
-- ----------------------------------------------------------------------------
INSERT INTO public.whatsapp_templates (template_name, content, variables, category, status, is_active, tenant_id)
SELECT
  'staff_invoice_submitted_v1',
  'Hi {{1}}, a new invoice {{2}} for {{3}} needs your review. Tap a button below to approve or reject, or open the portal for full details.',
  '[
    {"index":1,"description":"Approver name","placeholder":"{{1}}"},
    {"index":2,"description":"Invoice number","placeholder":"{{2}}"},
    {"index":3,"description":"Vendor company name","placeholder":"{{3}}"},
    {"index":4,"description":"Approve button dynamic URL suffix (token)","placeholder":"button:0"},
    {"index":5,"description":"Reject button dynamic URL suffix (token)","placeholder":"button:1"}
  ]'::jsonb,
  'UTILITY',
  'pending',
  false,
  'a0000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates WHERE template_name = 'staff_invoice_submitted_v1'
);

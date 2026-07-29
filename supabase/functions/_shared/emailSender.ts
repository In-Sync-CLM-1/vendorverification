// Per-tenant email sender overrides. Every tenant not listed here keeps
// sending from the shared default (Vendor-Sync's own Resend account and
// noreply@in-sync.co.in) — adding an override here must never change that
// default for anyone else.
const DEFAULT_API_KEY_ENV = "RESEND_API_KEY";
const DEFAULT_FROM = "Vendor-Sync <noreply@in-sync.co.in>";

const TENANT_SENDER_OVERRIDES: Record<string, { apiKeyEnv: string; from: string }> = {
  // REDEFINE MARCOM PRIVATE LIMITED — sends from their own verified domain
  // via their own Resend account, not the shared In-Sync one.
  "467ce2a0-5df8-40a7-81d6-ccdc77b66ce9": {
    apiKeyEnv: "REDEFINE_RESEND_API_KEY",
    from: "Redefine Marcom <notifications@redefinemarcom.in>",
  },
};

export interface EmailSender {
  apiKey: string;
  from: string;
}

export function getEmailSender(tenantId: string | null | undefined): EmailSender {
  const override = tenantId ? TENANT_SENDER_OVERRIDES[tenantId] : undefined;
  const apiKeyEnv = override?.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
  return {
    apiKey: Deno.env.get(apiKeyEnv) ?? Deno.env.get(DEFAULT_API_KEY_ENV) ?? "",
    from: override?.from ?? DEFAULT_FROM,
  };
}

// Every tenant that has NOT provisioned its own WhatsApp sending number
// falls back to this row's config. Never remove/rename this row's data —
// changing it changes WhatsApp behavior for every tenant without a
// dedicated whatsapp_settings row.
const DEFAULT_TENANT_ID = "a0000000-0000-0000-0000-000000000001";

export interface WhatsappSettings {
  exotel_sid: string;
  exotel_api_key: string;
  exotel_api_token: string;
  exotel_subdomain: string | null;
  whatsapp_source_number: string;
}

const SELECT_COLUMNS = "exotel_sid, exotel_api_key, exotel_api_token, exotel_subdomain, whatsapp_source_number";

// deno-lint-ignore no-explicit-any
export async function getWhatsappSettings(admin: any, tenantId: string | null | undefined): Promise<WhatsappSettings | null> {
  if (tenantId) {
    const { data } = await admin
      .from("whatsapp_settings")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return data;
  }

  const { data: fallback } = await admin
    .from("whatsapp_settings")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .eq("is_active", true)
    .maybeSingle();
  return fallback ?? null;
}

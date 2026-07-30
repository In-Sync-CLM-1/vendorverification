// Every tenant that hasn't configured its own verified sending domain falls
// back to this shared address. Never remove/rename — changing it changes
// the sender for every tenant without a dedicated from-name/address.
const DEFAULT_FROM = "Vendor-Sync <noreply@in-sync.co.in>";

// deno-lint-ignore no-explicit-any
export async function getEmailFrom(admin: any, tenantId: string | null | undefined): Promise<string> {
  if (tenantId) {
    const { data } = await admin
      .from("tenants")
      .select("notification_from_name, notification_from_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (data?.notification_from_email) {
      return data.notification_from_name
        ? `${data.notification_from_name} <${data.notification_from_email}>`
        : data.notification_from_email;
    }
  }
  return DEFAULT_FROM;
}

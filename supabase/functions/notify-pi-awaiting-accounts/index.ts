import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailFrom } from "../_shared/emailSender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = "https://vendor.in-sync.co.in/staff/vendor-payments";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Called by the app right after a project owner approves a PI / Quotation.
// The PI now sits at the Accounts stage, so Accounts is told (in-app + email).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) {
      return jsonResponse({ error: "Not signed in" }, 401);
    }

    const { row_id } = await req.json();
    if (!row_id) {
      return jsonResponse({ error: "row_id is required" }, 400);
    }

    const { data: row } = await admin
      .from("vendor_invoices")
      .select("id, vendor_id, tenant_id, pi_amount, doc_stage, project_name, project_number, pi_approval_stage, pi_owner_approved_at, pi_owner_approved_by")
      .eq("id", row_id)
      .in("doc_stage", ["proforma_invoice", "quotation"])
      .maybeSingle();
    if (!row) {
      return jsonResponse({ error: "PI/Quotation not found" }, 404);
    }

    // Only the person who gave the owner approval can trigger this, and only
    // while the PI is waiting at the Accounts stage and the approval is fresh.
    if (row.pi_owner_approved_by !== user.id) {
      return jsonResponse({ error: "Not authorized for this PI/Quotation" }, 403);
    }
    if (row.pi_approval_stage !== "awaiting_accounts") {
      return jsonResponse({ success: true, notified: 0, note: "Not waiting for Accounts" });
    }
    const approvedAt = row.pi_owner_approved_at ? new Date(row.pi_owner_approved_at).getTime() : 0;
    if (Date.now() - approvedAt > 15 * 60 * 1000) {
      return jsonResponse({ success: true, notified: 0, note: "Approval is not recent" });
    }

    const { data: roleRows } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "accounts")
      .eq("tenant_id", row.tenant_id);
    const { data: profileRows } = await admin
      .from("profiles")
      .select("user_id, full_name")
      .eq("tenant_id", row.tenant_id)
      .eq("is_active", true)
      .in("user_id", (roleRows ?? []).map((r: { user_id: string }) => r.user_id));
    const recipients = (profileRows ?? []) as { user_id: string; full_name: string | null }[];
    if (recipients.length === 0) {
      return jsonResponse({ success: true, notified: 0, note: "No active Accounts user" });
    }

    const { data: vendor } = await admin
      .from("vendors")
      .select("company_name")
      .eq("id", row.vendor_id)
      .maybeSingle();
    const { data: approver } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const vendorName = vendor?.company_name || "A vendor";
    const docLabel = row.doc_stage === "quotation" ? "Quotation" : "Proforma Invoice";
    const amountText =
      row.pi_amount != null
        ? `₹${Number(row.pi_amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
        : "an unstated amount";
    const projectLabel = row.project_number || row.project_name;
    const approverName = approver?.full_name || "The project owner";

    const emailFrom = await getEmailFrom(admin, row.tenant_id);
    let emailsSent = 0;
    for (const person of recipients) {
      await admin.from("notifications").insert({
        recipient_id: person.user_id,
        tenant_id: row.tenant_id,
        title: `${docLabel} awaiting Accounts approval`,
        message: `${approverName} approved ${vendorName}'s ${docLabel.toLowerCase()} of ${amountText} for ${projectLabel}. It now needs Accounts approval.`,
        notification_type: "pi_awaiting_accounts",
        related_vendor_id: row.vendor_id,
      });

      const { data: authUser } = await admin.auth.admin.getUserById(person.user_id);
      const email = authUser?.user?.email;
      if (!email) continue;
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from: emailFrom,
          to: [email],
          subject: `${docLabel} from ${vendorName} awaiting Accounts approval - Vendor-Sync`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #0066B3;">
                <h1 style="color: #0066B3; margin: 0;">Vendor-Sync</h1>
              </div>
              <div style="padding: 30px 0;">
                <p>Dear <strong>${person.full_name || "Accounts"}</strong>,</p>
                <p>${approverName} has approved a document as the project owner. It now needs Accounts approval.</p>
                <div style="background-color: #f8f9fa; border-left: 4px solid #0066B3; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <h3 style="margin: 0 0 8px 0; color: #0066B3;">${docLabel}: ${amountText}</h3>
                  <p style="margin: 4px 0; color: #333;">Vendor: ${vendorName}</p>
                  <p style="margin: 4px 0; color: #333;">Project: ${projectLabel}</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${PORTAL_URL}" style="background-color: #0066B3; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Review and approve
                  </a>
                </div>
              </div>
              <div style="border-top: 1px solid #eee; padding-top: 15px; text-align: center; color: #999; font-size: 12px;">
                <p>This is an automated notification. Please do not reply to this email.</p>
              </div>
            </div>
          `,
        }),
      });
      if (emailRes.ok) emailsSent++;
      else console.error("Awaiting-Accounts email failed:", await emailRes.text());
    }

    return jsonResponse({ success: true, notified: recipients.length, emails_sent: emailsSent });
  } catch (error) {
    console.error("notify-pi-awaiting-accounts failed:", error);
    return jsonResponse({ error: "Request failed" }, 500);
  }
});

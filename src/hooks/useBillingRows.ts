import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BillingCreditNote, BillingRow } from "@/lib/billing";

export const BILLING_KEY = "billing-rows";

/**
 * Every row of the billing flow the signed-in person may see: a vendor sees
 * their own, staff see their organisation's (row-level security does the
 * scoping). Credit notes are separate rows, folded onto the invoice they reduce.
 */
export function useBillingRows(scopeKey: string, enabled = true) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [BILLING_KEY, scopeKey],
    enabled,
    queryFn: async (): Promise<BillingRow[]> => {
      const [rowsRes, cnRes] = await Promise.all([
        supabase
          .from("vendor_invoices")
          .select(
            "*, vendors(company_name, vendor_code), purchase_orders(id, po_number, po_date, grand_total, pdf_file_key), vendor_invoice_payments(id, payment_date, advance_adjusted, gst_amount, tds_amount, payout_amount, total_settled, utr_reference, remarks, is_full_settlement)"
          )
          .in("doc_stage", ["proforma_invoice", "quotation", "invoice"])
          .order("created_at", { ascending: false }),
        supabase
          .from("vendor_invoices")
          .select("id, credit_for_invoice_id, invoice_number, invoice_date, invoice_amount, description, invoice_file_key, created_at")
          .eq("doc_stage", "credit_note")
          .order("created_at", { ascending: true }),
      ]);
      if (rowsRes.error) throw rowsRes.error;
      if (cnRes.error) throw cnRes.error;

      const cnByInvoice = new Map<string, BillingCreditNote[]>();
      for (const c of (cnRes.data || []) as unknown as BillingCreditNote[]) {
        const list = cnByInvoice.get(c.credit_for_invoice_id) || [];
        list.push(c);
        cnByInvoice.set(c.credit_for_invoice_id, list);
      }
      return ((rowsRes.data || []) as unknown as Omit<BillingRow, "credit_notes">[]).map((r) => ({
        ...r,
        credit_notes: cnByInvoice.get(r.id) || [],
      }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: [BILLING_KEY] });
  return { ...query, rows: query.data ?? [], refresh };
}

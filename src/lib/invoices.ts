import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

export type VendorInvoice = Database["public"]["Tables"]["vendor_invoices"]["Row"];
export type InvoicePayment = Database["public"]["Tables"]["vendor_invoice_payments"]["Row"];

export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; className: string }
> = {
  submitted: { label: "Submitted", className: "bg-blue-100 text-blue-800 border-blue-200" },
  under_review: { label: "Under Review", className: "bg-amber-100 text-amber-800 border-amber-200" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800 border-red-200" },
  partially_paid: { label: "Partially Paid", className: "bg-violet-100 text-violet-800 border-violet-200" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800 border-green-200" },
};

export const formatINR = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: value && Math.abs(value) >= 100000 ? 0 : 2,
  }).format(value || 0);

export async function uploadInvoiceFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const { data, error } = await supabase.functions.invoke("vendor-invoice-file", {
    body: formData,
  });
  if (error) throw new Error("Upload failed. Please try again.");
  if (data?.error) throw new Error(data.error);
  if (!data?.file_key) throw new Error("Upload failed. Please try again.");
  return data.file_key as string;
}

export interface InvoiceExtraction {
  invoice_number: string | null;
  invoice_number_confidence: number;
  invoice_date: string | null;
  invoice_date_confidence: number;
  invoice_amount: number | null;
  invoice_amount_confidence: number;
  gst_amount: number | null;
  gst_amount_confidence: number;
  po_number: string | null;
  po_number_confidence: number;
  description: string | null;
  overall_confidence: number;
  ai_model_version: string;
}

/** Reads an already-uploaded invoice/PO file and extracts its fields via AI. Throws with a user-facing message on failure (caller should fall back to manual entry). */
export async function analyzeInvoiceFile(fileKey: string): Promise<InvoiceExtraction> {
  const { data, error } = await supabase.functions.invoke("analyze-invoice", {
    body: { file_key: fileKey },
  });
  if (error) throw new Error("Could not read this file automatically, please fill in the details manually");
  if (!data?.success) throw new Error(data?.error || "Could not read this file automatically, please fill in the details manually");
  return data.data as InvoiceExtraction;
}

export const LOW_CONFIDENCE = 60;

export async function openInvoiceFile(key: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vendor-invoice-file?key=${encodeURIComponent(key)}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    }
  );
  if (!resp.ok) throw new Error("Could not open the file");
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Total settled against an invoice = advance adjusted + TDS + actual payout. */
export const paymentSettled = (p: Pick<InvoicePayment, "advance_adjusted" | "tds_amount" | "payout_amount">) =>
  Number(p.advance_adjusted || 0) + Number(p.tds_amount || 0) + Number(p.payout_amount || 0);

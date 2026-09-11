import { supabase } from "@/integrations/supabase/client";
import { uploadInvoiceFile, formatINR } from "@/lib/invoices";
import jsPDF from "jspdf";

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  vendor_id: string;
  pi_quotation_id: string | null;
  invoice_id: string | null;
  po_number: string;
  po_date: string;
  vendor_name: string;
  vendor_address: string | null;
  vendor_gstin: string | null;
  vendor_pan: string | null;
  issuer_name: string;
  issuer_address: string | null;
  issuer_gstin: string | null;
  project_number: string | null;
  project_name: string;
  place_of_supply: string;
  description: string;
  hsn_sac: string | null;
  taxable_amount: number;
  tax_type: "igst" | "cgst_sgst" | "none";
  tax_rate: number;
  tax_amount: number;
  grand_total: number;
  pdf_file_key: string | null;
  issued_by: string;
  created_at: string;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}

function threeDigits(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return `${hundred ? ONES[hundred] + " Hundred" + (rest ? " " : "") : ""}${rest ? twoDigits(rest) : ""}`;
}

/** Indian numbering (crore/lakh), whole rupees only -- matches the sample PO's "Amount in Words". */
export function amountInWordsINR(amount: number): string {
  const whole = Math.round(amount);
  if (whole === 0) return "Zero Only";

  const crore = Math.floor(whole / 1e7);
  const lakh = Math.floor((whole % 1e7) / 1e5);
  const thousand = Math.floor((whole % 1e5) / 1e3);
  const hundred = whole % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return `Rupees: ${parts.join(" ")} Only`;
}

/** IGST if the vendor's and issuer's GSTIN state codes (first 2 digits) differ, else CGST+SGST. */
export function inferTaxType(vendorGstin: string | null | undefined, issuerGstin: string | null | undefined): "igst" | "cgst_sgst" {
  const v = (vendorGstin || "").slice(0, 2);
  const i = (issuerGstin || "").slice(0, 2);
  if (v && i && v === i) return "cgst_sgst";
  return "igst";
}

function fmtDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
}

const TERMS = [
  "The Supplier on Receipt of this order must confirm acceptance of the same with company seal & signature.",
  "Price : Inclusive of all Taxes, Delivery & Courier Charges.",
  `The Invoice Should be raised in the name of ${""}`, // filled in at render time with issuer name
  "Payment within 45 days from date of the Invoice.",
  "Purchase Order No. should be mentioned in the Invoice.",
  "Purchaser reserves the right to cancel the order without any liability in case the materials are not supplied within the stipulated period.",
  "No Interest will be paid in case of any extended payment time limit.",
  "Payment shall be made only upon receipt of hard copy of the Invoice.",
  "This is a computer generated document hence no signature is required.",
];

/** Renders the PO to a single-page PDF matching the sample's layout, returned as a Blob. */
export function renderPurchaseOrderPdf(po: PurchaseOrder): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 50;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PURCHASE ORDER", margin, y);
  y += 30;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Purchase Order No.", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${po.po_number}`, margin + 110, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.text("Purchase Order Date", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${fmtDate(po.po_date)}`, margin + 110, y);
  y += 24;

  const colWidth = (pageWidth - margin * 2) / 2;
  const rightX = margin + colWidth + 10;
  const blockTop = y;

  doc.setFont("helvetica", "bold");
  doc.text("Vendor :", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(po.vendor_name, margin + 55, y);
  let vy = y + 14;
  doc.setFont("helvetica", "bold");
  doc.text("Address:", margin, vy);
  doc.setFont("helvetica", "normal");
  const addrLines = doc.splitTextToSize(po.vendor_address || "—", colWidth - 60);
  doc.text(addrLines, margin + 55, vy);
  vy += addrLines.length * 12 + 6;
  if (po.vendor_gstin) {
    doc.setFont("helvetica", "bold");
    doc.text("GSTIN No:", margin, vy);
    doc.setFont("helvetica", "normal");
    doc.text(po.vendor_gstin, margin + 55, vy);
    vy += 14;
  }
  if (po.vendor_pan) {
    doc.setFont("helvetica", "bold");
    doc.text("PAN No :", margin, vy);
    doc.setFont("helvetica", "normal");
    doc.text(po.vendor_pan, margin + 55, vy);
    vy += 14;
  }

  let by = blockTop;
  doc.setFont("helvetica", "bold");
  doc.text("Billing Address :", rightX, by);
  by += 14;
  doc.setFont("helvetica", "bold");
  doc.text(po.issuer_name, rightX, by);
  by += 14;
  doc.setFont("helvetica", "normal");
  const issuerAddrLines = doc.splitTextToSize(po.issuer_address || "—", colWidth - 20);
  doc.text(issuerAddrLines, rightX, by);
  by += issuerAddrLines.length * 12 + 6;
  if (po.issuer_gstin) {
    doc.text(`GSTIN No-${po.issuer_gstin}`, rightX, by);
    by += 14;
  }

  y = Math.max(vy, by) + 16;

  doc.setFont("helvetica", "bold");
  doc.text("Project No. :", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(po.project_number || "—", margin + 80, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text("Project :", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(po.project_name, pageWidth - margin * 2 - 80), margin + 80, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text("Place Of Supply :", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(po.place_of_supply, margin + 100, y);
  y += 24;

  // Item table
  const tableX = margin;
  const tableWidth = pageWidth - margin * 2;
  const colSno = 30, colHsn = 70, colAmt = 90;
  const colDesc = tableWidth - colSno - colHsn - colAmt;
  const rowH = 20;

  doc.setDrawColor(180);
  doc.setFillColor(240, 240, 240);
  doc.rect(tableX, y, tableWidth, rowH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("S.NO", tableX + 4, y + 13);
  doc.text("Description", tableX + colSno + 4, y + 13);
  doc.text("HSN/SAC", tableX + colSno + colDesc + 4, y + 13);
  doc.text("Amount", tableX + colSno + colDesc + colHsn + 4, y + 13);
  y += rowH;

  doc.setFont("helvetica", "normal");
  const descLines = doc.splitTextToSize(po.description, colDesc - 8);
  const itemRowH = Math.max(rowH, descLines.length * 11 + 8);
  doc.rect(tableX, y, tableWidth, itemRowH);
  doc.text("1", tableX + 4, y + 13);
  doc.text(descLines, tableX + colSno + 4, y + 13);
  doc.text(po.hsn_sac || "—", tableX + colSno + colDesc + 4, y + 13);
  doc.text(formatINR(po.taxable_amount).replace("₹", ""), tableX + colSno + colDesc + colHsn + 4, y + 13);
  y += itemRowH;

  const taxRow = (label: string, value: string, bold = false) => {
    doc.rect(tableX, y, tableWidth, rowH);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, tableX + colSno + 4, y + 13);
    doc.text(value, tableX + colSno + colDesc + colHsn + 4, y + 13);
    y += rowH;
  };

  taxRow("Taxable Amount", formatINR(po.taxable_amount).replace("₹", ""), true);
  if (po.tax_type === "igst") {
    taxRow(`IGST ${po.tax_rate}%`, formatINR(po.tax_amount).replace("₹", ""));
  } else if (po.tax_type === "cgst_sgst") {
    taxRow(`CGST ${po.tax_rate / 2}%`, formatINR(po.tax_amount / 2).replace("₹", ""));
    taxRow(`SGST ${po.tax_rate / 2}%`, formatINR(po.tax_amount / 2).replace("₹", ""));
  }
  taxRow("Grand Total", formatINR(po.grand_total).replace("₹", ""), true);

  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Amount in Words:", margin, y);
  y += 14;
  doc.setFont("helvetica", "italic");
  doc.text(amountInWordsINR(po.grand_total), margin, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.text("Terms & Conditions :", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  TERMS.map((t, i) => (i === 2 ? `The Invoice Should be raised in the name of ${po.issuer_name}.` : t)).forEach((t) => {
    const lines = doc.splitTextToSize(t, pageWidth - margin * 2 - 16);
    doc.text(lines, margin + 16, y);
    y += lines.length * 10 + 4;
  });

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CONFIDENTIALITY:", margin, y);
  y += 10;
  doc.setFont("helvetica", "normal");
  const conf = doc.splitTextToSize(
    "You hereby agree to keep highly confidential all matters concerning this Purchase Order (PO) and the work involved therein and agree not to discuss the same to any third party without prior consent.",
    pageWidth - margin * 2
  );
  doc.text(conf, margin, y);

  return doc.output("blob");
}

interface IssuePoInput {
  pi_quotation_id: string;
  description: string;
  hsn_sac: string;
  place_of_supply: string;
  taxable_amount: number;
  tax_type: "igst" | "cgst_sgst" | "none";
  tax_rate: number;
  po_date: string;
  vendor_id: string;
}

/** Calls issue_purchase_order, renders the PDF from the returned row, uploads it, and attaches the key. */
export async function issuePurchaseOrder(input: IssuePoInput): Promise<PurchaseOrder> {
  const { data, error } = await supabase.rpc("issue_purchase_order", {
    p_pi_quotation_id: input.pi_quotation_id,
    p_description: input.description,
    p_hsn_sac: input.hsn_sac || null,
    p_place_of_supply: input.place_of_supply,
    p_taxable_amount: input.taxable_amount,
    p_tax_type: input.tax_type,
    p_tax_rate: input.tax_type === "none" ? 0 : input.tax_rate,
    p_po_date: input.po_date,
  });
  if (error) throw new Error(error.message);
  const po = data as PurchaseOrder;

  try {
    const blob = renderPurchaseOrderPdf(po);
    const file = new File([blob], `PO_${po.po_number.replace(/\//g, "-")}.pdf`, { type: "application/pdf" });
    const key = await uploadInvoiceFile(file, input.vendor_id);
    const { error: attachError } = await supabase.rpc("attach_purchase_order_pdf", { p_po_id: po.id, p_pdf_file_key: key });
    if (attachError) throw new Error(attachError.message);
    po.pdf_file_key = key;
  } catch (e) {
    // The PO itself is already issued and numbered -- a PDF render/upload
    // failure shouldn't be reported as the whole action having failed.
    console.error("PO PDF generation/upload failed:", e);
  }

  return po;
}

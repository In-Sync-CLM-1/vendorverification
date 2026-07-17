import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR, paymentSettled, VendorInvoice, InvoicePayment } from "@/lib/invoices";
import { Loader2, Landmark, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

type OutstandingInvoice = VendorInvoice & {
  vendors: { company_name: string; vendor_code: string | null } | null;
  remaining: number;
};

interface ParsedLine {
  date: string | null;
  amount: number;
  reference: string | null;
  narration: string | null;
}

interface MatchRow extends ParsedLine {
  id: string;
  matchedInvoiceId: string | null;
  include: boolean;
}

const NO_MATCH = "__none__";

// Very small token-overlap fuzzy score — no library needed for "does this
// narration look like this vendor's name". Good enough as a suggestion;
// staff always confirms/changes the match before anything is recorded.
function nameSimilarity(narration: string, companyName: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const a = new Set(norm(narration));
  const b = norm(companyName);
  if (a.size === 0 || b.length === 0) return 0;
  const hits = b.filter((w) => a.has(w)).length;
  return hits / b.length;
}

function bestMatch(line: ParsedLine, candidates: OutstandingInvoice[]): string | null {
  if (candidates.length === 0) return null;

  // 1) Exact-ish amount match (within ₹1) — strongest signal.
  const amountMatches = candidates.filter((c) => Math.abs(c.remaining - line.amount) < 1);
  if (amountMatches.length === 1) return amountMatches[0].id;

  // 2) Among amount matches (or all candidates if none), pick best narration/name overlap.
  const pool = amountMatches.length > 0 ? amountMatches : candidates;
  const scored = pool
    .map((c) => ({ id: c.id, score: line.narration ? nameSimilarity(line.narration, c.vendors?.company_name || "") : 0 }))
    .sort((a, b) => b.score - a.score);

  if (scored[0]?.score > 0.4) return scored[0].id;
  if (amountMatches.length === 1) return amountMatches[0].id;
  return null;
}

export default function StaffPaymentMatching() {
  const queryClient = useQueryClient();
  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [recording, setRecording] = useState(false);

  const { data: invoices = [] } = useQuery({
    queryKey: ["outstanding-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_invoices")
        .select("*, vendors(company_name, vendor_code)")
        .in("status", ["approved", "partially_paid"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as (VendorInvoice & { vendors: { company_name: string; vendor_code: string | null } | null })[];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["outstanding-invoice-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendor_invoice_payments").select("*");
      if (error) throw error;
      return (data || []) as InvoicePayment[];
    },
  });

  const outstanding: OutstandingInvoice[] = useMemo(() => {
    const settledByInvoice = new Map<string, number>();
    for (const p of payments) settledByInvoice.set(p.invoice_id, (settledByInvoice.get(p.invoice_id) || 0) + paymentSettled(p));
    return invoices.map((inv) => ({
      ...inv,
      remaining: Number(inv.invoice_amount) - (settledByInvoice.get(inv.id) || 0),
    }));
  }, [invoices, payments]);

  const handleParse = async () => {
    if (!pastedText.trim() && !file) {
      toast.error("Paste the statement text or choose a file");
      return;
    }
    setParsing(true);
    try {
      let body: Record<string, unknown>;
      if (file) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
        }
        body = { file_base64: btoa(binary), mime_type: file.type };
      } else {
        body = { text: pastedText };
      }

      const { data, error } = await supabase.functions.invoke("parse-bank-statement", { body });
      if (error) throw new Error("Could not read this statement");
      if (!data?.success) throw new Error(data?.error || "Could not read this statement");

      const parsed: ParsedLine[] = data.payments || [];
      if (parsed.length === 0) {
        toast.error("No outgoing payment lines found");
        return;
      }

      const newRows: MatchRow[] = parsed.map((line, i) => ({
        ...line,
        id: `${Date.now()}_${i}`,
        matchedInvoiceId: bestMatch(line, outstanding),
        include: true,
      }));
      setRows(newRows);
      toast.success(`Found ${newRows.length} payment line${newRows.length === 1 ? "" : "s"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse statement");
    } finally {
      setParsing(false);
    }
  };

  const matchedCount = rows.filter((r) => r.include && r.matchedInvoiceId).length;

  const handleRecordAll = async () => {
    const toRecord = rows.filter((r) => r.include && r.matchedInvoiceId);
    if (toRecord.length === 0) {
      toast.error("Match at least one line to an invoice first");
      return;
    }
    setRecording(true);
    let recorded = 0;
    try {
      for (const row of toRecord) {
        const invoice = outstanding.find((o) => o.id === row.matchedInvoiceId);
        if (!invoice) continue;

        const isFullSettlement = row.amount >= invoice.remaining - 0.01;
        const { error } = await supabase.from("vendor_invoice_payments").insert({
          invoice_id: invoice.id,
          tenant_id: "00000000-0000-0000-0000-000000000000",
          vendor_id: invoice.vendor_id,
          payment_date: row.date || new Date().toISOString().slice(0, 10),
          advance_adjusted: 0,
          gst_amount: 0,
          tds_amount: 0,
          payout_amount: row.amount,
          utr_reference: row.reference || null,
          remarks: `Matched from bank statement${row.narration ? `: ${row.narration}` : ""}`,
          is_full_settlement: isFullSettlement,
        });
        if (error) {
          console.error(`Failed to record payment for ${invoice.invoice_number}:`, error);
          continue;
        }
        recorded++;

        supabase.functions
          .invoke("notify-vendor-invoice-status", {
            body: {
              event: "payment_recorded",
              invoice_id: invoice.id,
              extra: { amount: row.amount, utr: row.reference || undefined },
            },
          })
          .catch((e) => console.error("Vendor notification failed:", e));
      }

      toast.success(`Recorded ${recorded} of ${toRecord.length} payments`);
      setRows((prev) => prev.filter((r) => !toRecord.some((t) => t.id === r.id)));
      queryClient.invalidateQueries({ queryKey: ["outstanding-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-invoice-payments"] });
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["staff-invoice-payments"] });
    } finally {
      setRecording(false);
    }
  };

  return (
    <StaffLayout title="Match Payments">
      <div className="flex-1 overflow-auto">
        <div className="p-4 border-b bg-card">
          <h1 className="text-xl font-semibold">Match Payments from Bank Statement</h1>
          <p className="text-sm text-muted-foreground">
            Paste your bank statement text or upload a statement file — the outgoing payment lines
            are matched to approved invoices for you to confirm and record in one go.
          </p>
        </div>

        <div className="p-4 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <Textarea
                placeholder="Paste bank statement rows here (date, amount, UTR/reference, narration)…"
                rows={5}
                value={pastedText}
                onChange={(e) => {
                  setPastedText(e.target.value);
                  if (e.target.value) setFile(null);
                }}
                disabled={!!file}
              />
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.csv,.jpg,.jpeg,.png"
                    className="max-w-xs"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setFile(f);
                      if (f) setPastedText("");
                    }}
                  />
                  {file && <Badge variant="outline"><Upload className="h-3 w-3 mr-1" />{file.name}</Badge>}
                </div>
                <Button onClick={handleParse} disabled={parsing}>
                  {parsing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Reading…</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" /> Extract Payments</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {rows.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Narration</TableHead>
                        <TableHead className="min-w-[220px]">Matched Invoice</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Checkbox
                              checked={row.include}
                              onCheckedChange={(v) =>
                                setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, include: v === true } : r)))
                              }
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{row.date || "—"}</TableCell>
                          <TableCell className="text-right font-medium">{formatINR(row.amount)}</TableCell>
                          <TableCell className="text-xs">{row.reference || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[220px] truncate" title={row.narration || ""}>{row.narration || "—"}</TableCell>
                          <TableCell>
                            <Select
                              value={row.matchedInvoiceId || NO_MATCH}
                              onValueChange={(v) =>
                                setRows((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, matchedInvoiceId: v === NO_MATCH ? null : v } : r))
                                )
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="No match" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_MATCH}>No match — skip</SelectItem>
                                {outstanding.map((inv) => (
                                  <SelectItem key={inv.id} value={inv.id}>
                                    {inv.vendors?.company_name} · {inv.invoice_number} · {formatINR(inv.remaining)} due
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="p-4 border-t flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {matchedCount} of {rows.length} line{rows.length === 1 ? "" : "s"} matched and selected
                  </p>
                  <Button onClick={handleRecordAll} disabled={recording || matchedCount === 0}>
                    {recording ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recording…</>
                    ) : (
                      <><Landmark className="h-4 w-4 mr-2" /> Record {matchedCount} Payment{matchedCount === 1 ? "" : "s"}</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </StaffLayout>
  );
}

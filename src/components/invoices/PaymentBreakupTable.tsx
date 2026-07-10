import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR, InvoicePayment, paymentSettled } from "@/lib/invoices";

export function PaymentBreakupTable({ payments }: { payments: InvoicePayment[] }) {
  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground py-3">No payments recorded yet.</p>;
  }

  const totals = payments.reduce(
    (acc, p) => ({
      advance: acc.advance + Number(p.advance_adjusted || 0),
      gst: acc.gst + Number(p.gst_amount || 0),
      tds: acc.tds + Number(p.tds_amount || 0),
      payout: acc.payout + Number(p.payout_amount || 0),
      settled: acc.settled + paymentSettled(p),
    }),
    { advance: 0, gst: 0, tds: 0, payout: 0, settled: 0 }
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Advance Adjusted</TableHead>
            <TableHead className="text-right">GST</TableHead>
            <TableHead className="text-right">TDS</TableHead>
            <TableHead className="text-right">Actual Payout</TableHead>
            <TableHead className="text-right">Total Settled</TableHead>
            <TableHead>UTR / Reference</TableHead>
            <TableHead>Remarks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="whitespace-nowrap">
                {new Date(p.payment_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </TableCell>
              <TableCell className="text-right">{formatINR(Number(p.advance_adjusted))}</TableCell>
              <TableCell className="text-right">{formatINR(Number(p.gst_amount))}</TableCell>
              <TableCell className="text-right">{formatINR(Number(p.tds_amount))}</TableCell>
              <TableCell className="text-right font-medium">{formatINR(Number(p.payout_amount))}</TableCell>
              <TableCell className="text-right">{formatINR(paymentSettled(p))}</TableCell>
              <TableCell className="font-mono text-xs">{p.utr_reference || "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{p.remarks || "—"}</TableCell>
            </TableRow>
          ))}
          {payments.length > 1 && (
            <TableRow className="font-medium bg-muted/40">
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{formatINR(totals.advance)}</TableCell>
              <TableCell className="text-right">{formatINR(totals.gst)}</TableCell>
              <TableCell className="text-right">{formatINR(totals.tds)}</TableCell>
              <TableCell className="text-right">{formatINR(totals.payout)}</TableCell>
              <TableCell className="text-right">{formatINR(totals.settled)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

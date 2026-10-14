import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useBillingRows } from "@/hooks/useBillingRows";
import { BillingTable } from "@/components/billing/BillingTable";
import { DecidePiDialog, RecordAdvancePaymentDialog } from "@/components/billing/dialogs/SmallDialogs";
import { IssuePODialog } from "@/components/invoices/IssuePODialog";
import { RecordPaymentDialog, PaymentTarget } from "@/components/invoices/RecordPaymentDialog";
import { BillingRow, docFileKey, netPayable, settledTotal } from "@/lib/billing";
import { formatINR } from "@/lib/invoices";
import { StaffStrip } from "@/components/game/StaffStrip";
import { celebrate } from "@/components/game/Celebration";
import { clearStreak, doneToday, recordClear, recordDone } from "@/lib/gamification";
import { advPaid, nextActionFor, paidOut as rowPaidOut } from "@/lib/billing";

/** One table, one row per flow from PI to credit note, for everyone on the organisation's side. */
export default function StaffVendorPayments() {
  const { user } = useAuth();
  const { isAdmin, isAccounts, isViewOnly } = useUserRoles();
  const { rows, isLoading, refresh } = useBillingRows(`staff:${user?.id}`, !!user?.id);

  // Standalone advance requests made before advances moved onto the billing row.
  const { data: earlierAdvances = [] } = useQuery({
    queryKey: ["earlier-advance-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendor_advance_requests").select("amount").eq("status", "pending");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });
  const earlierTotal = earlierAdvances.reduce((s, r) => s + Number(r.amount || 0), 0);

  // The game layer: what is waiting on this person, and what they have cleared today.
  const viewer = { mode: "staff" as const, userId: user?.id ?? null, isAdmin, isAccounts, isViewOnly };
  const mine = rows.filter((r) => ["decide", "issue_po", "record_advance", "record_payment"].includes(nextActionFor(r, viewer).kind));
  const waiting = mine.length;
  const [done, setDone] = useState(() => doneToday(user?.id));
  const [clearDays, setClearDays] = useState(() => clearStreak(user?.id));
  const acted = useRef(false);
  const prevWaiting = useRef<number | null>(null);
  useEffect(() => {
    setDone(doneToday(user?.id));
    setClearDays(clearStreak(user?.id));
  }, [user?.id]);
  useEffect(() => {
    if (isLoading) return;
    if (acted.current && prevWaiting.current !== null && prevWaiting.current > 0 && waiting === 0) {
      recordClear(user?.id);
      setClearDays(clearStreak(user?.id));
      celebrate("Inbox clear", "Nothing is waiting on you now.", true);
    }
    prevWaiting.current = waiting;
  }, [waiting, isLoading, user?.id]);
  const oldestDays = mine.reduce((m, r) => {
    const k = nextActionFor(r, viewer).kind;
    const since = k === "decide" ? r.created_at : k === "issue_po" ? r.pi_reviewed_at || r.created_at : k === "record_advance" ? r.adv_requested_at || r.created_at : r.invoice_date || r.created_at;
    return Math.max(m, Math.max(Math.floor((Date.now() - new Date(since).getTime()) / 86400000), 0));
  }, 0);
  const paidOutTotal = rows.reduce((s, r) => s + rowPaidOut(r) + advPaid(r), 0);
  const acting = (after?: () => void) => () => {
    acted.current = true;
    recordDone(user?.id);
    setDone(doneToday(user?.id));
    refresh();
    after?.();
  };

  const [decideRow, setDecideRow] = useState<BillingRow | null>(null);
  const [poRow, setPoRow] = useState<BillingRow | null>(null);
  const [advRow, setAdvRow] = useState<BillingRow | null>(null);
  const [payRow, setPayRow] = useState<BillingRow | null>(null);

  const payTarget: PaymentTarget | null = payRow
    ? {
        kind: "invoice",
        id: payRow.id,
        vendor_id: payRow.vendor_id,
        amount: netPayable(payRow),
        label: `Invoice ${payRow.invoice_number}`,
      }
    : null;

  return (
    <StaffLayout title="Vendor Payments">
      <div className="flex-1 overflow-auto font-jakarta">
        <div className="border-b bg-card p-4">
          <h1 className="text-xl font-bold">Vendor Payments</h1>
          <p className="text-sm text-muted-foreground">
            One row per piece of work, from the PI to the last credit note. The only approval is the PI; everything after it is recorded.
          </p>
        </div>
        <div className="space-y-3 p-4">
          <StaffStrip
            done={done}
            waiting={waiting}
            noun={isAccounts ? "items to action" : "PIs to decide"}
            oldestDays={oldestDays}
            clearDays={clearDays}
            paidOut={isAccounts ? paidOutTotal : undefined}
          />
          {earlierAdvances.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {earlierAdvances.length} earlier advance request{earlierAdvances.length === 1 ? "" : "s"} ({formatINR(earlierTotal)}) made before advances moved onto the billing row {earlierAdvances.length === 1 ? "is" : "are"} still waiting for a decision.{" "}
              <Link to="/staff/advance-requests" className="font-semibold underline">Review them</Link>
            </div>
          )}
          <BillingTable
            rows={rows}
            loading={isLoading}
            viewer={viewer}
            actions={{
              decide: (r) => setDecideRow(r),
              issuePo: (r) => setPoRow(r),
              recordAdvance: (r) => setAdvRow(r),
              recordPayment: (r) => setPayRow(r),
              resubmit: () => {},
              requestAdvance: () => {},
              uploadInvoice: () => {},
              raiseCreditNote: () => {},
            }}
            emptyTitle="Nothing here yet"
            emptyHint="Rows appear as soon as an approved vendor submits a PI."
          />
        </div>
      </div>

      <DecidePiDialog open={!!decideRow} onOpenChange={(o) => !o && setDecideRow(null)} row={decideRow} onDone={(info) => acting(() => info?.final && celebrate("PI approved", "Accounts can now issue the PO"))()} />
      <RecordAdvancePaymentDialog open={!!advRow} onOpenChange={(o) => !o && setAdvRow(null)} row={advRow} onDone={acting()} />
      {poRow && (
        <IssuePODialog
          open={!!poRow}
          onOpenChange={(o) => !o && setPoRow(null)}
          target={{
            id: poRow.id,
            vendor_id: poRow.vendor_id,
            vendorName: poRow.vendors?.company_name || "",
            projectName: poRow.project_name || "",
            projectNumber: poRow.project_number,
            amount: poRow.pi_amount == null ? null : Number(poRow.pi_amount),
            documentType: poRow.doc_stage === "quotation" ? "quotation" : "proforma_invoice",
            fileKey: docFileKey(poRow),
          }}
          onIssued={acting(() => celebrate("PO issued", "The vendor can now invoice"))}
        />
      )}
      {payTarget && payRow && (
        <RecordPaymentDialog
          open={!!payRow}
          onOpenChange={(o) => !o && setPayRow(null)}
          target={payTarget}
          alreadySettled={settledTotal(payRow)}
          onRecorded={acting()}
        />
      )}
    </StaffLayout>
  );
}

import { Flame, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/invoices";

function Ring({ done, total }: { done: number; total: number }) {
  const C = 2 * Math.PI * 21;
  const p = total ? Math.min(done / total, 1) : 1;
  return (
    <svg className="h-14 w-14 shrink-0" viewBox="0 0 56 56" role="img" aria-label={`${done} of ${total} done today`}>
      <circle cx="28" cy="28" r="21" fill="none" stroke="#E6ECF4" strokeWidth="7" />
      <circle
        cx="28"
        cy="28"
        r="21"
        fill="none"
        stroke="#17733E"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={C.toFixed(1)}
        strokeDashoffset={(C * (1 - p)).toFixed(1)}
        transform="rotate(-90 28 28)"
        className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
      />
    </svg>
  );
}

/**
 * Three small cards for the person working a queue: how much they have done
 * today, what is waiting on them (and for how long), and either a streak of
 * clear-inbox days or, for Accounts, what has been paid out.
 */
export function StaffStrip({
  done,
  waiting,
  noun,
  oldestDays,
  clearDays,
  paidOut,
}: {
  done: number;
  waiting: number;
  noun: string;
  oldestDays: number;
  clearDays: number;
  paidOut?: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card className="flex items-center gap-3.5 p-4">
        <Ring done={done} total={waiting + done} />
        <div>
          <div className="text-xl font-extrabold leading-tight">{done} of {waiting + done}</div>
          <div className="text-xs text-muted-foreground">done today</div>
        </div>
      </Card>
      <Card className="flex items-center gap-3.5 p-4">
        <div>
          <div className="text-xl font-extrabold leading-tight">
            {waiting} <span className="text-[13px] font-semibold text-muted-foreground">{noun}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {waiting ? `Oldest has waited ${oldestDays} ${oldestDays === 1 ? "day" : "days"}${oldestDays >= 5 ? " · over the 5-day target" : ""}` : "Nothing is waiting on you"}
          </div>
        </div>
      </Card>
      <Card className="flex items-center gap-3.5 p-4">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${paidOut !== undefined ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {paidOut !== undefined ? <Wallet className="h-5 w-5" /> : <Flame className="h-5 w-5" />}
        </div>
        <div>
          <div className="text-xl font-extrabold leading-tight tabular-nums">{paidOut !== undefined ? formatINR(paidOut) : `${clearDays} ${clearDays === 1 ? "day" : "days"}`}</div>
          <div className="text-xs text-muted-foreground">{paidOut !== undefined ? "paid out so far" : "with an empty inbox"}</div>
        </div>
      </Card>
    </div>
  );
}

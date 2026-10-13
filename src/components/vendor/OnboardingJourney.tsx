import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ClipboardCheck, FileText, Mail, Search, ShieldCheck } from "lucide-react";

type Tone = "done" | "now" | "fix" | "bad" | "todo";

const MILESTONES = [
  { key: "invited", title: "Invited", sub: "Link received", Icon: Mail },
  { key: "registered", title: "Registered", sub: "Details and documents sent", Icon: FileText },
  { key: "verification", title: "Verification", sub: "Documents, PAN, GST and bank checked", Icon: Search },
  { key: "approval", title: "Approval", sub: "Final decision", Icon: ClipboardCheck },
  { key: "verified", title: "Verified", sub: "Billing opens", Icon: ShieldCheck },
] as const;

const TONES_BY_STATUS: Record<string, Tone[]> = {
  draft: ["done", "now", "todo", "todo", "todo"],
  pending_review: ["done", "done", "now", "todo", "todo"],
  in_verification: ["done", "done", "now", "todo", "todo"],
  returned_to_maker: ["done", "done", "now", "todo", "todo"],
  sent_back: ["done", "done", "fix", "todo", "todo"],
  pending_approval: ["done", "done", "done", "now", "todo"],
  rejected: ["done", "done", "done", "bad", "todo"],
};

const PROGRESS: Record<string, number> = {
  draft: 20,
  pending_review: 45,
  in_verification: 45,
  returned_to_maker: 45,
  sent_back: 40,
  pending_approval: 75,
  rejected: 60,
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  pending_review: { label: "Pending review", className: "bg-amber-100 text-amber-800 border-amber-200" },
  in_verification: { label: "In verification", className: "bg-amber-100 text-amber-800 border-amber-200" },
  returned_to_maker: { label: "In verification", className: "bg-amber-100 text-amber-800 border-amber-200" },
  pending_approval: { label: "Pending approval", className: "bg-sky-100 text-sky-800 border-sky-200" },
  sent_back: { label: "Needs your action", className: "bg-amber-100 text-amber-800 border-amber-200" },
  rejected: { label: "Not approved", className: "bg-red-100 text-red-800 border-red-200" },
};

const NODE: Record<Tone, string> = {
  done: "border-emerald-200 bg-emerald-50/60",
  now: "border-primary ring-2 ring-primary/15",
  fix: "border-amber-300 ring-2 ring-amber-100",
  bad: "border-red-200",
  todo: "border-border",
};
const ICON: Record<Tone, string> = {
  done: "bg-emerald-700 text-white",
  now: "bg-primary text-primary-foreground",
  fix: "bg-amber-700 text-white",
  bad: "bg-red-600 text-white",
  todo: "bg-muted text-muted-foreground",
};

/** The one-time journey from invitation to Verified Vendor. Billing is a separate flow that opens after it. */
export function OnboardingJourney({
  status,
  note,
  needsDocuments,
}: {
  status: string;
  note?: string | null;
  needsDocuments?: boolean;
}) {
  const tones = TONES_BY_STATUS[status] ?? TONES_BY_STATUS.pending_review;
  const pct = PROGRESS[status] ?? 45;
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.pending_review;
  const fix = status === "sent_back";

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Your journey to Verified Vendor</h2>
          <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <b className="text-foreground">{pct}%</b>
          </div>
          <div className="h-3.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`h-full rounded-full ${fix ? "bg-gradient-to-r from-amber-700 to-amber-400" : "bg-gradient-to-r from-primary to-sky-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {MILESTONES.map((m, i) => (
            <div key={m.key} className={`flex flex-col gap-1.5 rounded-xl border bg-card p-3 ${NODE[tones[i]]}`}>
              <div className={`grid h-9 w-9 place-items-center rounded-xl ${ICON[tones[i]]}`}>
                <m.Icon className="h-[18px] w-[18px]" />
              </div>
              <b className="text-sm">{m.title}</b>
              <small className="text-xs text-muted-foreground">{m.sub}</small>
            </div>
          ))}
        </div>

        {status === "sent_back" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <b>The verification team needs something from you</b>
              {note && <p className="mt-0.5">{note}</p>}
              <p className="mt-1 text-xs">
                {needsDocuments ? "Open the Documents tab and re-upload the flagged documents." : "Check the Documents tab and update your details."}
              </p>
            </div>
          </div>
        )}
        {status === "rejected" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <b>Your registration was not approved</b>
            {note && <p className="mt-0.5">{note}</p>}
          </div>
        )}
        {(status === "pending_review" || status === "in_verification" || status === "returned_to_maker") && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
            Your registration is with the verification team. They check your documents, PAN, GST and bank details.
          </div>
        )}
        {status === "pending_approval" && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
            Verification is complete. Your registration is with the approver for the final decision.
          </div>
        )}
        <p className="text-xs text-muted-foreground">Billing opens as a separate step once you are approved.</p>
      </CardContent>
    </Card>
  );
}

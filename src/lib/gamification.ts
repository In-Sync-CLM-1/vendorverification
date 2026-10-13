import { BillingRow, isInvoice, isPiStage, stageOf } from "@/lib/billing";

/**
 * Levels, XP, streaks and achievements are worked out from a vendor's real
 * rows, never stored, so they can never drift from the money. They reward
 * clean, complete paperwork. Nothing here rewards speed of approval on the
 * organisation's side.
 */

export const LEVELS = [
  { name: "Starter", from: 0 },
  { name: "Rising", from: 100 },
  { name: "Trusted", from: 300 },
  { name: "Preferred", from: 800 },
] as const;

export interface LevelInfo {
  index: number;
  name: string;
  next: string | null;
  xpToNext: number;
  pct: number;
}

/** XP: a PI sent 10, approved +15, an advance +5, an invoice +20, paid in full +30, verified vendor +40. */
export function xpOf(rows: BillingRow[], verified: boolean): number {
  let xp = verified ? 40 : 0;
  for (const r of rows) {
    xp += 10;
    if (r.status === "approved" || isInvoice(r)) xp += 15;
    if (r.adv_status) xp += 5;
    if (isInvoice(r)) {
      xp += 20;
      if (stageOf(r) === "paid") xp += 30;
    }
  }
  return xp;
}

export function levelOf(xp: number): LevelInfo {
  let i = 0;
  LEVELS.forEach((l, k) => {
    if (xp >= l.from) i = k;
  });
  const next = LEVELS[i + 1];
  const from = LEVELS[i].from;
  return {
    index: i,
    name: LEVELS[i].name,
    next: next ? next.name : null,
    xpToNext: next ? next.from - xp : 0,
    pct: next ? Math.round(((xp - from) / (next.from - from)) * 100) : 100,
  };
}

/** How many of the vendor's most recent jobs went through without a rejection. */
export function cleanStreak(rows: BillingRow[]): number {
  const newestFirst = [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  let n = 0;
  for (const r of newestFirst) {
    if (isPiStage(r) && r.status === "rejected") break;
    n++;
  }
  return n;
}

export interface Achievement {
  id: string;
  title: string;
  hint: string;
  earned: boolean;
  color: string;
}

export function achievementsOf(rows: BillingRow[], verified: boolean): Achievement[] {
  const paid = rows.filter((r) => isInvoice(r) && stageOf(r) === "paid");
  const everRejected = rows.some((r) => r.pi_review_comments && r.pi_status === "rejected") || rows.some((r) => isPiStage(r) && r.status === "rejected");
  return [
    { id: "verified", title: "Verified vendor", hint: "Pass onboarding", earned: verified, color: "#17733E" },
    { id: "first-pi", title: "First PI sent", hint: "Submit a PI", earned: rows.length > 0, color: "#0066B3" },
    { id: "first-approval", title: "First approval", hint: "Get a PI approved", earned: rows.some((r) => r.status === "approved" || isInvoice(r)), color: "#0F766E" },
    { id: "invoice", title: "Invoice sent", hint: "Upload an invoice", earned: rows.some(isInvoice), color: "#1E3A5F" },
    { id: "paid", title: "Paid in full", hint: "An invoice fully paid", earned: paid.length > 0, color: "#B45309" },
    { id: "streak", title: "Clean streak", hint: "3 jobs in a row without a rejection", earned: cleanStreak(rows) >= 3, color: "#7C3AED" },
    { id: "spotless", title: "Spotless record", hint: "No PI ever rejected", earned: rows.length > 0 && !everRejected, color: "#E5532D" },
    { id: "five", title: "Five paid", hint: "Five invoices fully paid", earned: paid.length >= 5, color: "#0A5C9E" },
  ];
}

/** Per-person memory of what they last saw, so a gain is shown once. Wrapped: storage can be blocked. */
export function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the game layer just forgets */
  }
}

const dayKey = () => new Date().toISOString().slice(0, 10);

/** Today's count of things a person has acted on (a personal motivator, not an audit). */
export function doneToday(userId: string | null | undefined): number {
  if (!userId) return 0;
  const v = readStored<{ day: string; n: number }>(`game-done-${userId}`);
  return v && v.day === dayKey() ? v.n : 0;
}
export function recordDone(userId: string | null | undefined) {
  if (!userId) return;
  writeStored(`game-done-${userId}`, { day: dayKey(), n: doneToday(userId) + 1 });
}
export function clearStreak(userId: string | null | undefined): number {
  if (!userId) return 0;
  return readStored<{ days: string[] }>(`game-clear-${userId}`)?.days.length ?? 0;
}
export function recordClear(userId: string | null | undefined) {
  if (!userId) return;
  const cur = readStored<{ days: string[] }>(`game-clear-${userId}`)?.days ?? [];
  const d = dayKey();
  if (!cur.includes(d)) writeStored(`game-clear-${userId}`, { days: [...cur, d].slice(-60) });
}

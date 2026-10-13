import { useEffect, useMemo, useState } from "react";
import { Flame, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { BillingRow } from "@/lib/billing";
import { Achievement, achievementsOf, cleanStreak, levelOf, readStored, writeStored, xpOf } from "@/lib/gamification";
import { celebrate } from "./Celebration";

interface Memory {
  xp: number;
  level: number;
  earned: string[];
}

/**
 * What the vendor has earned, worked out from their rows. Compared with what
 * they last saw (kept in this browser) so a gain is celebrated once, and a
 * first visit just sets the baseline instead of celebrating history.
 */
export function useVendorGame(vendorId: string | undefined, rows: BillingRow[], verified: boolean, ready: boolean) {
  const xp = useMemo(() => xpOf(rows, verified), [rows, verified]);
  const level = useMemo(() => levelOf(xp), [xp]);
  const streak = useMemo(() => cleanStreak(rows), [rows]);
  const achievements = useMemo(() => achievementsOf(rows, verified), [rows, verified]);
  const [gained, setGained] = useState(0);
  const [justEarned, setJustEarned] = useState<string | null>(null);
  const key = vendorId ? `game-vendor-${vendorId}` : null;

  useEffect(() => {
    if (!key || !ready) return;
    const mem = readStored<Memory>(key);
    if (mem) {
      setGained(Math.max(xp - mem.xp, 0));
      const fresh = achievements.find((a) => a.earned && !mem.earned.includes(a.id));
      setJustEarned(fresh?.id ?? null);
      if (level.index > mem.level) celebrate("Level up", `You reached ${level.name}`, true);
      else if (fresh) celebrate("Achievement unlocked", fresh.title, false);
    }
    writeStored(key, { xp, level: level.index, earned: achievements.filter((a) => a.earned).map((a) => a.id) } satisfies Memory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, xp]);

  return { xp, level, streak, achievements, gained, justEarned };
}

/** Level, XP bar and streak, shown on the dark hero. */
export function ScoreStrip({ xp, level, streak, gained }: { xp: number; level: ReturnType<typeof levelOf>; streak: number; gained: number }) {
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[auto_minmax(180px,1fr)_auto]">
      <div className="flex items-center gap-2.5 rounded-2xl border border-white/20 bg-white/10 px-3.5 py-2">
        <Trophy className="h-6 w-6 text-amber-300" />
        <div>
          <b className="block text-[15px] leading-tight">Level {level.index + 1} · {level.name}</b>
          <small className="text-xs text-blue-200">{xp} XP earned</small>
        </div>
      </div>
      <div>
        <div
          className="h-3 overflow-hidden rounded-full bg-white/20"
          role="progressbar"
          aria-valuenow={level.pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={level.next ? `${level.xpToNext} XP to ${level.next}` : "Top level reached"}
        >
          <div className="h-full rounded-full bg-gradient-to-r from-[#7CBB44] to-[#C6E36B] transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${level.pct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between gap-2 text-xs text-blue-100">
          <span>{level.next ? `${level.xpToNext} XP to ${level.next}` : "Top level reached"}</span>
          {gained > 0 && <span className="font-extrabold text-lime-300 animate-in fade-in slide-in-from-bottom-2 duration-700">+{gained} XP</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3.5 py-2 text-sm">
        <Flame className="h-5 w-5 text-orange-400" />
        <span><b className="text-lg">{streak}</b> clean in a row</span>
      </div>
    </div>
  );
}

/** The achievement badges: earned ones in colour, the rest greyed with how to earn them. */
export function AchievementShelf({ achievements, justEarned }: { achievements: Achievement[]; justEarned?: string | null }) {
  const earned = achievements.filter((a) => a.earned).length;
  return (
    <Card className="p-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <b className="text-[15px]">Achievements</b>
        <span className="text-xs text-muted-foreground">{earned} of {achievements.length} earned</span>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {achievements.map((a) => (
          <li key={a.id} className="flex flex-col items-center gap-1.5 px-1 py-2 text-center">
            <div
              className={`grid h-[50px] w-11 place-items-center text-white [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)] ${justEarned === a.id ? "animate-in zoom-in-50 duration-700" : ""}`}
              style={{ background: a.earned ? a.color : "#D8DFE8", color: a.earned ? "#fff" : "#8A97A6" }}
              aria-hidden="true"
            >
              <Trophy className="h-5 w-5" />
            </div>
            <b className={`text-xs leading-tight ${a.earned ? "" : "text-muted-foreground"}`}>{a.title}</b>
            <small className="text-[11px] leading-tight text-muted-foreground">{a.earned ? "Earned" : a.hint}</small>
          </li>
        ))}
      </ul>
    </Card>
  );
}

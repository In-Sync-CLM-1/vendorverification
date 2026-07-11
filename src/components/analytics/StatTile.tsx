import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { VIZ } from "@/lib/vizPalette";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  /** Signed % change vs a named period; null hides the delta. */
  deltaPct?: number | null;
  deltaLabel?: string;
  /** true when an increase is good (settled), false when it's a growing liability (outstanding). */
  upIsGood?: boolean;
  spark?: number[];
  sub?: string;
}

function Sparkline({ data }: { data: number[] }) {
  const d = useMemo(() => {
    if (data.length < 2) return null;
    const w = 96, h = 28, pad = 2;
    const max = Math.max(...data), min = Math.min(...data);
    const span = max - min || 1;
    const pts = data.map((v, i) => [
      pad + (i / (data.length - 1)) * (w - pad * 2),
      h - pad - ((v - min) / span) * (h - pad * 2),
    ]);
    return {
      path: pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      last: pts[pts.length - 1],
    };
  }, [data]);
  if (!d) return null;
  return (
    <svg width="96" height="28" className="shrink-0" aria-hidden="true">
      <path d={d.path} fill="none" stroke={VIZ.axis} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={d.last[0]} cy={d.last[1]} r="3" fill={VIZ.blue} stroke={VIZ.surface} strokeWidth="2" />
    </svg>
  );
}

export function StatTile({ label, value, deltaPct, deltaLabel = "vs previous period", upIsGood = true, spark, sub }: StatTileProps) {
  const showDelta = deltaPct !== null && deltaPct !== undefined && Number.isFinite(deltaPct);
  const up = (deltaPct || 0) >= 0;
  const good = up === upIsGood;
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-semibold leading-none tracking-tight">{value}</p>
          {spark && spark.some((v) => v > 0) && <Sparkline data={spark} />}
        </div>
        <div className="mt-2 min-h-4 flex items-center gap-1.5 text-xs">
          {showDelta && (
            <>
              <span className={cn("font-medium", good ? "text-[#006300]" : "text-[#d03b3b]")}>
                {up ? "▲" : "▼"} {Math.abs(deltaPct!).toFixed(0)}%
              </span>
              <span className="text-muted-foreground">{deltaLabel}</span>
            </>
          )}
          {!showDelta && sub && <span className="text-muted-foreground">{sub}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

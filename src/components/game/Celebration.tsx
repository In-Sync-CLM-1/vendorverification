import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

type Listener = (c: { title: string; sub?: string; big: boolean; id: number }) => void;
let listener: Listener | null = null;
let counter = 0;

/** Show a short celebration (a banner and confetti) from anywhere in the app. */
export function celebrate(title: string, sub?: string, big = false) {
  listener?.({ title, sub, big, id: ++counter });
}

const COLORS = ["#0066B3", "#7CBB44", "#F59F0A", "#7C3AED", "#0F766E", "#E5532D"];

/** Mounted once at the app root. Respects the reduced-motion setting: banner only, no confetti. */
export function CelebrationHost() {
  const [current, setCurrent] = useState<{ title: string; sub?: string; id: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const timer = useRef<number>();

  useEffect(() => {
    listener = (c) => {
      setCurrent({ title: c.title, sub: c.sub, id: c.id });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCurrent(null), 3400);

      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      const cv = canvas.current;
      const cx = cv?.getContext("2d");
      if (!cv || !cx) return;
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      const n = c.big ? 150 : 80;
      const ps = Array.from({ length: n }, (_, i) => ({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 160,
        y: 120,
        vx: (Math.random() - 0.5) * 11,
        vy: Math.random() * -6 - 2,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 5,
        r: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4,
        c: COLORS[i % COLORS.length],
      }));
      const t0 = performance.now();
      const step = (t: number) => {
        const dt = t - t0;
        cx.clearRect(0, 0, cv.width, cv.height);
        for (const p of ps) {
          p.vy += 0.22;
          p.x += p.vx;
          p.y += p.vy;
          p.r += p.vr;
          cx.save();
          cx.translate(p.x, p.y);
          cx.rotate(p.r);
          cx.globalAlpha = Math.max(1 - dt / 2200, 0);
          cx.fillStyle = p.c;
          cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          cx.restore();
        }
        if (dt < 2200) requestAnimationFrame(step);
        else cx.clearRect(0, 0, cv.width, cv.height);
      };
      requestAnimationFrame(step);
    };
    return () => {
      listener = null;
      window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <>
      <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[150]" />
      {current && (
        <div
          key={current.id}
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-20 z-[160] flex max-w-[92vw] -translate-x-1/2 items-center gap-3.5 rounded-2xl border bg-card px-4 py-3 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-500"
        >
          <div
            className="grid h-12 w-11 place-items-center text-white [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]"
            style={{ background: "linear-gradient(160deg,#F59F0A,#E5532D)" }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <b className="block text-[15px]">{current.title}</b>
            {current.sub && <small className="text-muted-foreground">{current.sub}</small>}
          </div>
        </div>
      )}
    </>
  );
}

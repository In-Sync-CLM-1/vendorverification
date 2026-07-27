import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const BRAND_COLORS = [
  "#0066B3", // In-Sync Blue
  "#7AB648", // In-Sync Green
  "#FFD700", // Gold
  "#00B4D8", // Teal
  "#4CAF50", // Green accent
  "#FF9800", // Orange accent
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: number;
}

function createParticles(canvas: HTMLCanvasElement, count: number): Particle[] {
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.3;
  return Array.from({ length: count }, () => ({
    x: cx,
    y: cy,
    vx: (Math.random() - 0.5) * 16,
    vy: Math.random() * -14 - 4,
    color: BRAND_COLORS[Math.floor(Math.random() * BRAND_COLORS.length)],
    size: Math.random() * 8 + 4,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 10,
    opacity: 1,
    shape: Math.floor(Math.random() * 3),
  }));
}

export function RegistrationSuccess() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const particles = createParticles(canvas, 150);
    let frame = 0;
    const maxFrames = 240; // ~4 seconds at 60fps
    let rafId: number;

    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.vy += 0.25; // gravity
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.opacity = Math.max(0, 1 - frame / maxFrames);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;

        if (p.shape === 0) {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -p.size / 2);
          ctx.lineTo(p.size / 2, p.size / 2);
          ctx.lineTo(-p.size / 2, p.size / 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      if (frame < maxFrames) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6 relative overflow-hidden">
      {/* Confetti canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Content */}
      <div className="relative z-20 flex flex-col items-center gap-6">
        {/* Animated checkmark */}
        <div
          className="w-28 h-28 rounded-full bg-accent/10 flex items-center justify-center"
          style={{
            animation: "celebScaleIn 0.5s ease-out 0.3s both",
          }}
        >
          <CheckCircle2 className="h-14 w-14 text-accent" />
        </div>

        {/* Thank You heading */}
        <h1
          className="text-5xl font-bold text-primary"
          style={{ animation: "celebFadeIn 0.6s ease-out 0.5s both" }}
        >
          Thank You!
        </h1>

        {/* Subtitle */}
        <h2
          className="text-2xl font-semibold text-foreground"
          style={{ animation: "celebFadeIn 0.6s ease-out 0.7s both" }}
        >
          Registration Submitted!
        </h2>

        {/* Description */}
        <p
          className="text-lg text-muted-foreground max-w-md"
          style={{ animation: "celebFadeIn 0.6s ease-out 0.9s both" }}
        >
          Your vendor registration has been received. Our team will review your
          application and get in touch shortly.
        </p>

        {/* Portal access */}
        <div
          className="flex flex-col items-center gap-2"
          style={{ animation: "celebFadeIn 0.6s ease-out 1.0s both" }}
        >
          <p className="text-sm text-muted-foreground max-w-sm">
            Need to add another document, or check your application status? Sign in to the
            Vendor Portal anytime with the mobile number or email you registered.
          </p>
          <Button variant="outline" onClick={() => navigate("/vendor/portal")}>
            Go to Vendor Portal
          </Button>
        </div>

        {/* Security badge */}
        <div
          className="flex items-center gap-2 text-base text-muted-foreground mt-2"
          style={{ animation: "celebFadeIn 0.6s ease-out 1.2s both" }}
        >
          <ShieldCheck className="h-5 w-5" />
          <span>256-bit Encrypted | DPDP Act Compliant</span>
        </div>
      </div>

      <style>{`
        @keyframes celebScaleIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes celebFadeIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

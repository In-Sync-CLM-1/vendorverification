import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Building2,
  ShieldCheck,
  CheckCircle2,
  Phone,
  Landmark,
  FileText,
  Lock,
  CreditCard,
  Fingerprint,
  Receipt,
  ScanSearch,
  Bot,
  Upload,
  ArrowRight,
  XCircle,
  AlertCircle,
  ClipboardCheck,
  Eye,
} from "lucide-react";

/* ════════════════════════════════════════════════════
   SLIDE DATA
   ════════════════════════════════════════════════════ */

interface Slide {
  title: string;
  subtitle: string;
  duration: number;
  render: () => React.ReactNode;
}

const slides: Slide[] = [
  // 0 — Title
  {
    title: "Vendor Verification",
    subtitle: "Vendor Management",
    duration: 5,
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center px-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Vendor Verification Portal</h2>
        <p className="text-muted-foreground text-sm max-w-sm">End-to-end registration, verification, and approval workflow</p>
        <div className="flex gap-6 mt-5">
          {[
            { icon: <Building2 className="h-4 w-4" />, label: "Register", color: "text-blue-600 bg-blue-50" },
            { icon: <ShieldCheck className="h-4 w-4" />, label: "Verify", color: "text-amber-600 bg-amber-50" },
            { icon: <CheckCircle2 className="h-4 w-4" />, label: "Approve", color: "text-green-600 bg-green-50" },
          ].map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 animate-in fade-in duration-500" style={{ animationDelay: `${(i + 1) * 300}ms`, animationFillMode: "both" }}>
              <div className={`h-9 w-9 rounded-full flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <span className="text-xs font-medium">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 1 — Status Lifecycle
  {
    title: "Status Lifecycle",
    subtitle: "From draft to approved",
    duration: 7,
    render: () => (
      <div className="flex flex-col items-center justify-center h-full px-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h3 className="text-lg font-semibold mb-3">Vendor Status Lifecycle</h3>
        <div className="space-y-1.5 w-full max-w-xs">
          {[
            { label: "Draft", color: "bg-slate-100 border-slate-300 text-slate-700", delay: 0 },
            { label: "Pending Review", color: "bg-amber-50 border-amber-300 text-amber-700", delay: 200 },
            { label: "In Verification", color: "bg-blue-50 border-blue-300 text-blue-700", delay: 400 },
            { label: "Pending Approval", color: "bg-purple-50 border-purple-300 text-purple-700", delay: 600 },
            { label: "Approved", color: "bg-green-50 border-green-300 text-green-700", delay: 800 },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${s.delay}ms`, animationFillMode: "both" }}>
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</div>
              <div className={`flex-1 px-3 py-1.5 rounded-md border font-medium text-xs ${s.color}`}>{s.label}</div>
              {i < 4 && <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <span className="text-xs px-1.5 py-0.5 rounded border bg-orange-50 border-orange-300 text-orange-700 animate-in fade-in duration-500" style={{ animationDelay: "1200ms", animationFillMode: "both" }}>Sent Back (at any stage)</span>
          <span className="text-xs px-1.5 py-0.5 rounded border bg-red-50 border-red-300 text-red-700 animate-in fade-in duration-500" style={{ animationDelay: "1400ms", animationFillMode: "both" }}>Deactivated (admin)</span>
        </div>
      </div>
    ),
  },

  // 2 — Registration Step 1: Consent
  {
    title: "Step 1: Consent",
    subtitle: "DPDP compliance",
    duration: 5,
    render: () => (
      <SlideLayout step={1} total={5} icon={<ClipboardCheck className="h-6 w-6" />} color="purple" title="DPDP Consent" subtitle="Vendor provides explicit data processing consent">
        <AnimatedList items={[
          "Consent checkbox with full privacy policy",
          "Records: version, purpose, IP, user agent",
          "Can be withdrawn — status changes to consent_withdrawn",
          "Compliant with Digital Personal Data Protection Act",
        ]} />
      </SlideLayout>
    ),
  },

  // 3 — Registration Step 2: Company
  {
    title: "Step 2: Company",
    subtitle: "Business details",
    duration: 6,
    render: () => (
      <SlideLayout step={2} total={5} icon={<Building2 className="h-6 w-6" />} color="blue" title="Company Details" subtitle="Business information and identifiers">
        <div className="space-y-2 mt-3">
          {[
            { field: "Company Name", req: true },
            { field: "Trade Name", req: false },
            { field: "Business Type", req: true },
            { field: "GST Number", req: false, note: "15-char GSTIN" },
            { field: "PAN Number", req: false, note: "10-char format" },
          ].map((f, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded bg-muted/50 animate-in fade-in slide-in-from-right-2 duration-300" style={{ animationDelay: `${i * 150}ms`, animationFillMode: "both" }}>
              <span className="text-sm">{f.field}</span>
              <div className="flex items-center gap-2">
                {f.note && <span className="text-xs text-muted-foreground">{f.note}</span>}
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${f.req ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                  {f.req ? "Required" : "Optional"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SlideLayout>
    ),
  },

  // 4 — Registration Step 3: Contact & OTP
  {
    title: "Step 3: Contact & OTP",
    subtitle: "Phone & email verification",
    duration: 7,
    render: () => (
      <SlideLayout step={3} total={5} icon={<Phone className="h-6 w-6" />} color="green" title="Contact & OTP Verification" subtitle="Both phone and email verified via OTP">
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-lg border-2 border-green-200 bg-green-50/50 p-2 animate-in fade-in slide-in-from-left-4 duration-500" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
            <div className="font-semibold text-xs text-green-800 mb-1 flex items-center gap-1">
              <Phone className="h-3 w-3" /> WhatsApp OTP
            </div>
            <ul className="text-xs text-green-700/80 space-y-0.5 list-disc pl-3">
              <li>Via Exotel API</li>
              <li>6-digit, 5min expiry</li>
              <li>Max 3 attempts</li>
              <li>60s cooldown</li>
            </ul>
          </div>
          <div className="rounded-lg border-2 border-blue-200 bg-blue-50/50 p-2 animate-in fade-in slide-in-from-right-4 duration-500" style={{ animationDelay: "400ms", animationFillMode: "both" }}>
            <div className="font-semibold text-xs text-blue-800 mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" /> Email OTP
            </div>
            <ul className="text-xs text-blue-700/80 space-y-0.5 list-disc pl-3">
              <li>Via Resend</li>
              <li>Branded template</li>
              <li>6-digit, 5min expiry</li>
              <li>Max 3 attempts</li>
            </ul>
          </div>
        </div>
      </SlideLayout>
    ),
  },

  // 5 — Registration Step 4: Bank
  {
    title: "Step 4: Bank Details",
    subtitle: "Financial information",
    duration: 5,
    render: () => (
      <SlideLayout step={4} total={5} icon={<Landmark className="h-6 w-6" />} color="amber" title="Bank Details" subtitle="Account information for payments">
        <div className="space-y-2 mt-3">
          {[
            { field: "Bank Name", note: "" },
            { field: "Branch Name", note: "" },
            { field: "Account Number", note: "Numeric" },
            { field: "IFSC Code", note: "Auto-corrects O to 0" },
          ].map((f, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded bg-muted/50 animate-in fade-in slide-in-from-right-2 duration-300" style={{ animationDelay: `${i * 150}ms`, animationFillMode: "both" }}>
              <span className="text-sm">{f.field}</span>
              <div className="flex items-center gap-2">
                {f.note && <span className="text-xs text-muted-foreground">{f.note}</span>}
                <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-700">Required</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-1.5 text-xs text-amber-800 animate-in fade-in duration-500" style={{ animationDelay: "800ms", animationFillMode: "both" }}>
          <Lock className="h-2.5 w-2.5 inline mr-0.5" /> All PII encrypted at rest with pgp_sym_encrypt.
        </div>
      </SlideLayout>
    ),
  },

  // 6 — Registration Step 5: Documents
  {
    title: "Step 5: Documents",
    subtitle: "Upload & AI analysis",
    duration: 6,
    render: () => (
      <SlideLayout step={5} total={5} icon={<Upload className="h-6 w-6" />} color="teal" title="Document Upload" subtitle="Upload required documents per vendor category">
        <AnimatedList items={[
          "Formats: PDF, JPG, PNG (max 10 MB)",
          "Stored in Supabase Storage with RLS",
          "Each upload triggers AI analysis",
          "Mandatory documents marked with *",
        ]} />
        <div className="flex flex-wrap gap-1.5 mt-3">
          {["GST Certificate", "PAN Card", "Cancelled Cheque", "Address Proof", "CIN Certificate"].map((doc, i) => (
            <span key={doc} className="text-sm bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full animate-in fade-in duration-300" style={{ animationDelay: `${600 + i * 100}ms`, animationFillMode: "both" }}>
              {doc}
            </span>
          ))}
        </div>
      </SlideLayout>
    ),
  },

  // 7 — Verification APIs
  {
    title: "Verification APIs",
    subtitle: "6 real-time checks",
    duration: 8,
    render: () => (
      <div className="flex flex-col h-full px-5 pt-4 animate-in fade-in duration-500">
        <h3 className="text-lg font-semibold mb-0.5">Real-time Verification APIs</h3>
        <p className="text-sm text-muted-foreground mb-3">Powered by Surepass with retry & exponential backoff</p>
        <div className="space-y-1.5 flex-1">
          {[
            { icon: <CreditCard className="h-3.5 w-3.5" />, name: "PAN", fn: "verify-pan", status: "working" as const, delay: 0 },
            { icon: <Receipt className="h-3.5 w-3.5" />, name: "GST", fn: "verify-gst", status: "working" as const, delay: 150 },
            { icon: <Landmark className="h-3.5 w-3.5" />, name: "Bank Account", fn: "verify-bank-account", status: "working" as const, delay: 300 },
            { icon: <Fingerprint className="h-3.5 w-3.5" />, name: "Aadhaar (DigiLocker)", fn: "verify-aadhaar", status: "multi" as const, delay: 450 },
          ].map((v, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 px-2.5 rounded-md border bg-card animate-in fade-in slide-in-from-left-3 duration-400" style={{ animationDelay: `${v.delay}ms`, animationFillMode: "both" }}>
              <div className="text-primary">{v.icon}</div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium">{v.name}</span>
                <span className="text-xs text-muted-foreground ml-1.5">{v.fn}</span>
              </div>
              <StatusDot status={v.status} />
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 8 — AI Document Analysis
  {
    title: "AI Document Analysis",
    subtitle: "Vision + tool calling",
    duration: 7,
    render: () => (
      <div className="flex flex-col items-center justify-center h-full px-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center mb-2">
          <Bot className="h-5 w-5 text-purple-600" />
        </div>
        <h3 className="text-lg font-semibold mb-0.5">AI-Powered Document Analysis</h3>
        <p className="text-sm text-muted-foreground mb-4">Vision + tool calling for structured extraction</p>
        <div className="w-full max-w-xs space-y-1.5">
          {[
            { label: "Field Extraction", desc: "Name, value, confidence score per field", icon: <FileText className="h-3.5 w-3.5 text-blue-600" />, delay: 300 },
            { label: "Classification", desc: "Auto-detected document type with confidence %", icon: <Eye className="h-3.5 w-3.5 text-green-600" />, delay: 500 },
            { label: "Tamper Detection", desc: "Tampering indicators list and score (0-1)", icon: <ShieldCheck className="h-3.5 w-3.5 text-red-600" />, delay: 700 },
            { label: "PII Masking", desc: "PAN: AB***34F, Account: ****1234", icon: <Lock className="h-3.5 w-3.5 text-amber-600" />, delay: 900 },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-md border animate-in fade-in slide-in-from-bottom-2 duration-400" style={{ animationDelay: `${item.delay}ms`, animationFillMode: "both" }}>
              <div className="mt-0.5">{item.icon}</div>
              <div>
                <div className="text-xs font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 9 — Staff Workflow
  {
    title: "Staff Workflow",
    subtitle: "Reviewer > Approver",
    duration: 7,
    render: () => (
      <div className="flex flex-col items-center justify-center h-full px-5 animate-in fade-in duration-500">
        <h3 className="text-lg font-semibold mb-0.5">Two-Stage Review</h3>
        <p className="text-sm text-muted-foreground mb-4">Every vendor passes through two levels of review</p>
        <div className="w-full max-w-xs space-y-1.5">
          {[
            { role: "Reviewer", desc: "Reviews documents, runs verifications, checks AI analysis.", color: "border-l-blue-500 bg-blue-50/30", delay: 200 },
            { role: "Approver", desc: "Final sign-off. Grants or rejects vendor onboarding.", color: "border-l-green-500 bg-green-50/30", delay: 500 },
          ].map((r, i) => (
            <div key={i}>
              <div className={`p-2.5 rounded-md border border-l-4 ${r.color} animate-in fade-in slide-in-from-right-4 duration-500`} style={{ animationDelay: `${r.delay}ms`, animationFillMode: "both" }}>
                <div className="text-xs font-semibold mb-0.5">{r.role}</div>
                <div className="text-sm text-muted-foreground">{r.desc}</div>
              </div>
              {i < 2 && (
                <div className="flex justify-center py-0.5 animate-in fade-in duration-300" style={{ animationDelay: `${r.delay + 200}ms`, animationFillMode: "both" }}>
                  <ArrowRight className="h-3 w-3 text-muted-foreground rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 10 — Security
  {
    title: "Security & Compliance",
    subtitle: "Encryption, RLS, DPDP",
    duration: 7,
    render: () => (
      <div className="flex flex-col items-center justify-center h-full px-5 animate-in fade-in duration-500">
        <h3 className="text-lg font-semibold mb-0.5">Security & Compliance</h3>
        <p className="text-sm text-muted-foreground mb-3">Enterprise-grade data protection</p>
        <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
          {[
            { icon: <Lock className="h-4 w-4 text-red-600" />, label: "PII Encryption", desc: "pgp_sym_encrypt, Vault key", bg: "bg-red-50", delay: 200 },
            { icon: <ShieldCheck className="h-4 w-4 text-purple-600" />, label: "Row-Level Security", desc: "RLS on all tables", bg: "bg-purple-50", delay: 400 },
            { icon: <ClipboardCheck className="h-4 w-4 text-amber-600" />, label: "DPDP Compliance", desc: "Consent, data requests", bg: "bg-amber-50", delay: 600 },
            { icon: <Eye className="h-4 w-4 text-green-600" />, label: "Audit Logging", desc: "PII access, workflow trail", bg: "bg-green-50", delay: 800 },
          ].map((s, i) => (
            <div key={i} className={`${s.bg} rounded-lg p-2.5 text-center animate-in fade-in zoom-in-95 duration-400`} style={{ animationDelay: `${s.delay}ms`, animationFillMode: "both" }}>
              <div className="flex justify-center mb-1">{s.icon}</div>
              <div className="text-sm font-semibold mb-0.5">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 11 — End
  {
    title: "Ready to Go",
    subtitle: "",
    duration: 5,
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center px-5 animate-in fade-in zoom-in-95 duration-700">
        <div className="h-11 w-11 rounded-full bg-green-100 flex items-center justify-center mb-3">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-1">Ready to Verify Vendors</h2>
        <p className="text-sm text-muted-foreground max-w-sm">Sign in to access the dashboard, review queue, and start processing vendor applications.</p>
      </div>
    ),
  },
];

/* ════════════════════════════════════════════════════
   CHAPTER MAP (for step cards)
   ════════════════════════════════════════════════════ */

export interface ChapterInfo {
  slideIndex: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

export const chapters: ChapterInfo[] = [
  { slideIndex: 0, icon: <Building2 className="h-4 w-4" />, title: "Overview", description: "Platform introduction", color: "bg-primary/10 text-primary" },
  { slideIndex: 1, icon: <ArrowRight className="h-4 w-4" />, title: "Status Lifecycle", description: "Draft to approved flow", color: "bg-slate-100 text-slate-600" },
  { slideIndex: 2, icon: <ClipboardCheck className="h-4 w-4" />, title: "Registration", description: "5-step vendor form", color: "bg-purple-100 text-purple-600" },
  { slideIndex: 7, icon: <ShieldCheck className="h-4 w-4" />, title: "Verifications", description: "6 real-time API checks", color: "bg-blue-100 text-blue-600" },
  { slideIndex: 8, icon: <Bot className="h-4 w-4" />, title: "AI Analysis", description: "Document intelligence", color: "bg-purple-100 text-purple-600" },
  { slideIndex: 9, icon: <Eye className="h-4 w-4" />, title: "Staff Workflow", description: "3-tier review process", color: "bg-amber-100 text-amber-600" },
  { slideIndex: 10, icon: <Lock className="h-4 w-4" />, title: "Security", description: "Encryption & compliance", color: "bg-red-100 text-red-600" },
];

/* ════════════════════════════════════════════════════
   IMPERATIVE HANDLE
   ════════════════════════════════════════════════════ */

export interface WalkthroughHandle {
  goToSlide: (index: number) => void;
}

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════ */

export const ProcessWalkthrough = forwardRef<WalkthroughHandle>(function ProcessWalkthrough(_, ref) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const TICK_MS = 50;

  const slide = slides[current];
  const totalSlides = slides.length;

  const goTo = useCallback((idx: number) => {
    setCurrent(idx);
    setProgress(0);
  }, []);

  const next = useCallback(() => {
    if (current < totalSlides - 1) {
      goTo(current + 1);
    } else {
      // Loop back to the beginning
      goTo(0);
    }
  }, [current, totalSlides, goTo]);

  const prev = useCallback(() => {
    goTo(Math.max(0, current - 1));
  }, [current, goTo]);

  const restart = useCallback(() => {
    goTo(0);
    setPlaying(true);
  }, [goTo]);

  // Expose goToSlide for parent
  useImperativeHandle(ref, () => ({
    goToSlide: (idx: number) => {
      goTo(idx);
      setPlaying(true);
    },
  }), [goTo]);

  // Auto-advance timer
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (playing) {
      const durationMs = slide.duration * 1000;
      intervalRef.current = setInterval(() => {
        setProgress(prev => {
          const next = prev + (TICK_MS / durationMs) * 100;
          if (next >= 100) return 100;
          return next;
        });
      }, TICK_MS);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, current, slide.duration]);

  // When progress hits 100, go next
  useEffect(() => {
    if (progress >= 100) {
      next();
    }
  }, [progress, next]);

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      {/* Slide content — scaled to fit 16:9 */}
      <div className="flex-1 min-h-0 relative overflow-hidden" key={current}>
        <div className="absolute inset-0 overflow-y-auto">
          {slide.render()}
        </div>
      </div>

      {/* Minimal controls — no visible loader/progress */}
      <div className="border-t bg-muted/20 px-3 py-1 flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          <button onClick={prev} disabled={current === 0} className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
            <SkipBack className="h-3 w-3" />
          </button>
          <button onClick={() => setPlaying(!playing)} className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors">
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
          </button>
          <button onClick={next} disabled={current === totalSlides - 1} className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
            <SkipForward className="h-3 w-3" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{slide.title}</div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-mono">{current + 1}/{totalSlides}</span>
          <button onClick={restart} className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted transition-colors" title="Restart">
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
});

/* ════════════════════════════════════════════════════
   HELPER COMPONENTS
   ════════════════════════════════════════════════════ */

function SlideLayout({ step, total, icon, color, title, subtitle, children }: {
  step: number; total: number; icon: React.ReactNode; color: string; title: string; subtitle: string; children: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    purple: "bg-purple-100 text-purple-600",
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    amber: "bg-amber-100 text-amber-600",
    teal: "bg-teal-100 text-teal-600",
  };

  return (
    <div className="flex flex-col h-full px-5 pt-3 pb-2 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>{icon}</div>
        <div className="flex-1">
          <div className="text-base font-semibold">{title}</div>
          <div className="text-sm text-muted-foreground">{subtitle}</div>
        </div>
        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Step {step}/{total}</span>
      </div>
      <div className="flex gap-0.5 mb-3">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${i < step ? colorMap[color].split(" ")[0] : "bg-muted"}`} />
        ))}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function AnimatedList({ items }: { items: string[] }) {
  return (
    <div className="space-y-2 mt-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 text-sm animate-in fade-in slide-in-from-left-3 duration-400" style={{ animationDelay: `${(i + 1) * 200}ms`, animationFillMode: "both" }}>
          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
          <span className="text-muted-foreground">{item}</span>
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: "working" | "inactive" | "multi" }) {
  if (status === "working") return (
    <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /> Working
    </span>
  );
  if (status === "inactive") return (
    <span className="flex items-center gap-1 text-sm text-red-500 font-medium">
      <XCircle className="h-3 w-3" /> Inactive
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-sm text-blue-600 font-medium">
      <AlertCircle className="h-3 w-3" /> Multi-step
    </span>
  );
}

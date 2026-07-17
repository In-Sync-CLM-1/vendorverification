import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantLogo } from "@/hooks/useTenantLogo";
import {
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  Brain,
  CheckCircle2,
  Lock,
  ClipboardCheck,
  Send,
  BadgeCheck,
  IndianRupee,
  Sparkles,
  AlertTriangle,
  FileText,
  UserCheck,
  Wallet,
  Quote,
  Play,
  KeyRound,
  Landmark,
  BellRing,
  UserCog,
  Building2,
  ScanSearch,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProcessWalkthrough } from "@/components/staff/ProcessWalkthrough";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

/* ────────────────────────────────────────────────────────────────
   Product vignettes — small mock-UI compositions that SHOW each
   lifecycle stage instead of describing it. Decorative only.
   ──────────────────────────────────────────────────────────────── */

function VignetteFrame({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="relative rounded-2xl bg-gradient-to-br from-primary/[0.06] via-muted/60 to-accent/[0.07] border border-border p-5 sm:p-8">
      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden max-w-sm mx-auto">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="h-2 w-2 rounded-full bg-border" />
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function VignetteVerification() {
  return (
    <VignetteFrame>
      <p className="text-xs font-semibold mb-2.5">Padmavati Communications · verification</p>
      <div className="space-y-1.5">
        {[
          { label: "PAN", note: "AAACP····K", ok: true },
          { label: "GSTIN", note: "27AAACP····1Z5", ok: true },
          { label: "Bank account", note: "penny-drop confirmed", ok: true },
        ].map((r) => (
          <div key={r.label} className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
            <span className="text-xs font-medium">{r.label}</span>
            <span className="text-[11px] text-muted-foreground">{r.note}</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0" />
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
          <span className="text-[11px] text-foreground">Similar name found: “Padmavati Comm.” — flagged for review</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Reviewer → Approver</span>
        <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[11px] font-semibold">Approved</span>
      </div>
    </VignetteFrame>
  );
}

function VignetteLogin() {
  return (
    <VignetteFrame>
      <p className="text-xs font-semibold mb-1">Vendor login</p>
      <p className="text-[11px] text-muted-foreground mb-3">No password — a one-time code, sent where you already are</p>
      <div className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs mb-3">anita@saffron····.com</div>
      <div className="flex gap-1.5 mb-3">
        {["4", "7", "2", "9", "", ""].map((d, i) => (
          <span
            key={i}
            className={`h-9 w-8 rounded-md border text-center leading-9 text-sm font-bold ${d ? "border-primary/40 bg-primary/5 text-foreground" : "border-border bg-muted/30 text-muted-foreground"}`}
          >
            {d}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-accent font-medium flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" /> Code sent to email &amp; WhatsApp
      </p>
    </VignetteFrame>
  );
}

function VignetteInvoice() {
  return (
    <VignetteFrame>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium">
          <FileText className="h-3 w-3 text-primary" /> invoice_2047.pdf
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold">
          <Sparkles className="h-2.5 w-2.5" /> AI read
        </span>
      </div>
      <div className="space-y-1.5">
        {[
          { field: "Invoice No", value: "INV-2047", conf: "99%" },
          { field: "Date", value: "12 Jul 2026", conf: "97%" },
          { field: "Amount", value: "₹1,18,000", conf: "98%" },
        ].map((r) => (
          <div key={r.field} className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
            <span className="text-[11px] text-muted-foreground w-20">{r.field}</span>
            <span className="text-xs font-medium flex-1">{r.value}</span>
            <span className="text-[10px] text-accent font-semibold">{r.conf}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1">
        <Lock className="h-3 w-3" /> Locked after submission — a clean audit trail
      </p>
    </VignetteFrame>
  );
}

function VignettePayment() {
  return (
    <VignetteFrame>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-semibold">INV-2047 · settlement</p>
        <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[11px] font-semibold">Paid</span>
      </div>
      <div className="space-y-1.5">
        {[
          { label: "Invoice amount", value: "₹1,18,000", strong: false },
          { label: "Advance adjusted", value: "− ₹20,000", strong: false },
          { label: "TDS (2%)", value: "− ₹2,360", strong: false },
          { label: "Payout · UTR N2607…", value: "₹95,640", strong: true },
        ].map((r) => (
          <div
            key={r.label}
            className={`flex items-center justify-between rounded-md px-2.5 py-1.5 ${r.strong ? "bg-accent/10 border border-accent/30" : "bg-muted/50"}`}
          >
            <span className={`text-[11px] ${r.strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{r.label}</span>
            <span className={`text-xs ${r.strong ? "font-bold" : "font-medium"}`}>{r.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg rounded-tl-none border border-accent/30 bg-accent/10 px-2.5 py-1.5">
        <p className="text-[11px] text-foreground flex items-start gap-1.5">
          <BellRing className="h-3 w-3 mt-0.5 shrink-0 text-accent" />
          ₹95,640 paid against INV-2047 — sent to the vendor on WhatsApp &amp; email, automatically
        </p>
      </div>
    </VignetteFrame>
  );
}

function VignetteChangeRequest() {
  return (
    <VignetteFrame>
      <p className="text-xs font-semibold mb-2.5">Detail change request</p>
      <div className="rounded-md bg-muted/50 px-2.5 py-2 mb-1.5">
        <p className="text-[11px] text-muted-foreground mb-1">Bank account</p>
        <p className="text-xs font-medium flex items-center gap-2">
          ····0237 <ArrowRight className="h-3 w-3 text-muted-foreground" /> ····8841
        </p>
      </div>
      <div className="rounded-md bg-muted/50 px-2.5 py-2 mb-3">
        <p className="text-[11px] text-muted-foreground mb-1">Vendor note</p>
        <p className="text-xs italic">“Old account is being closed”</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-warning/15 text-warning px-2 py-0.5 text-[11px] font-semibold">Pending review</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
          <CheckCircle2 className="h-3 w-3" /> Approve &amp; apply
        </span>
      </div>
      <p className="mt-2.5 text-[11px] text-muted-foreground">Nothing changes until your team approves.</p>
    </VignetteFrame>
  );
}

/* ────────────────────────────────────────────────────────────────
   Content
   ──────────────────────────────────────────────────────────────── */

const LIFECYCLE = [
  {
    step: "01",
    icon: ShieldCheck,
    title: "Onboard with confidence",
    desc: "PAN, GST and bank verified against live government sources — fraud and duplicates flagged before you commit.",
    points: ["Live PAN, GST & bank checks", "Fraud & duplicates caught early", "Maker–checker–approver trail"],
    vignette: VignetteVerification,
  },
  {
    step: "02",
    icon: KeyRound,
    title: "One portal, zero passwords",
    desc: "Approved vendors log in with a one-time code to their registered email or WhatsApp.",
    points: ["Nothing for IT to provision", "No reset tickets, ever", "Vendors see their own status"],
    vignette: VignetteLogin,
  },
  {
    step: "03",
    icon: FileText,
    title: "Invoices without the inbox",
    desc: "Vendors upload, AI reads and pre-fills, your team approves from one queue.",
    points: ["AI reads every invoice", "Locked after submission", "One review queue"],
    vignette: VignetteInvoice,
  },
  {
    step: "04",
    icon: Landmark,
    title: "Payments everyone can see",
    desc: "Full advance / GST / TDS / payout breakup on every settlement — vendors notified the moment it lands.",
    points: ["Match a bank statement in one screen", "Part-payments to full & final", "Automatic vendor notifications"],
    vignette: VignettePayment,
  },
  {
    step: "05",
    icon: UserCog,
    title: "Details that stay current",
    desc: "Vendors request their own bank and contact updates; your team approves before anything applies.",
    points: ["Self-service requests", "Staff approval gate", "Every change logged"],
    vignette: VignetteChangeRequest,
  },
];

const STATS = [
  { value: "< 5 min", label: "Verification turnaround" },
  { value: "5", label: "Live government API checks" },
  { value: "0", label: "Vendor passwords to manage" },
  { value: "100%", label: "Audit-ready trail" },
];

const TRUST_BADGES = [
  { icon: Lock, label: "256-bit encryption" },
  { icon: ShieldCheck, label: "DPDP Act compliant" },
  { icon: FileCheck2, label: "Live government API checks" },
  { icon: ClipboardCheck, label: "Complete audit trail" },
];

const ONBOARDING_TRACK = [
  { icon: Send, title: "Invite sent" },
  { icon: UserCheck, title: "Identity verified (OTP)" },
  { icon: FileText, title: "Documents submitted" },
  { icon: Brain, title: "AI reads every document" },
  { icon: ScanSearch, title: "Government APIs confirm" },
  { icon: AlertTriangle, title: "Fraud flagged automatically" },
  { icon: ClipboardCheck, title: "Reviewer checks" },
  { icon: BadgeCheck, title: "Approver signs off" },
];

const INVOICING_TRACK = [
  { icon: Upload, title: "Vendor uploads invoice" },
  { icon: Sparkles, title: "AI reads & pre-fills" },
  { icon: ClipboardCheck, title: "Your team approves" },
  { icon: Landmark, title: "Payment recorded with breakup" },
  { icon: BellRing, title: "Vendor notified automatically" },
];

const PRICING = [
  {
    name: "Starter",
    price: "2,999",
    period: "quarter",
    verifications: "10 verifications included",
    overage: "299",
    desc: "For teams starting vendor due diligence",
    popular: false,
  },
  {
    name: "Business",
    price: "7,499",
    period: "quarter",
    verifications: "35 verifications included",
    overage: "249",
    desc: "For growing organizations with regular vendor commitments",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "14,999",
    period: "quarter",
    verifications: "100 verifications included",
    overage: "199",
    desc: "For large teams with high vendor volumes",
    popular: false,
  },
];

const PLAN_FEATURES = [
  "Credit score & financial health checks",
  "Live PAN, GST & bank verification",
  "AI document analysis & fraud detection",
  "Maker–checker–approver workflow",
  "Vendor portal with OTP login",
  "Invoices & payments with full breakup",
  "Bank-statement payment matching",
  "Automatic vendor notifications",
  "DPDP compliant, PDF reports",
];

const TESTIMONIALS = [
  {
    quote: "We caught a financially unstable vendor before committing a ₹50L purchase order. The bank statement analysis alone saved us from a potential write-off.",
    name: "Rajesh Mehta",
    title: "CFO",
    company: "Manufacturing Enterprise, Mumbai",
  },
  {
    quote: "What used to take our team 7-10 days of manual verification now happens in under 5 minutes. The GST and bank statement analysis is remarkably thorough.",
    name: "Priya Sharma",
    title: "Head of Procurement",
    company: "IT Services Company, Bangalore",
  },
  {
    quote: "The audit trail is what sold us. Every verification, every document, every approval — all downloadable as a PDF. Our auditors were impressed.",
    name: "Amit Desai",
    title: "Finance Head",
    company: "Infrastructure Group, Pune",
  },
];

const CLIENT_LOGOS = [
  { src: "/logos/quess.png", alt: "Quess Corp" },
  { src: "/logos/motherson.jpg", alt: "Motherson" },
  { src: "/logos/hiranandani.png", alt: "Hiranandani" },
  { src: "/logos/audi.png", alt: "Audi" },
  { src: "/logos/college-dekho.jpg", alt: "College Dekho" },
  { src: "/logos/zolve.webp", alt: "Zolve" },
  { src: "/logos/capital-india.webp", alt: "Capital India" },
  { src: "/logos/ecofy.png", alt: "Ecofy" },
  { src: "/logos/zopper.png", alt: "Zopper" },
  { src: "/logos/alice-blue.png", alt: "Alice Blue" },
  { src: "/logos/ezeepay.png", alt: "Ezeepay" },
  { src: "/logos/incred.png", alt: "InCred" },
  { src: "/logos/seeds.png", alt: "Seeds" },
  { src: "/logos/growthvine.png", alt: "GrowthVine" },
  { src: "/logos/uhc.png", alt: "UHC" },
  { src: "/logos/car-trends.webp", alt: "Car Trends" },
  { src: "/logos/legitquest.png", alt: "LegitQuest" },
  { src: "/logos/evco.jpg", alt: "EV Co" },
  { src: "/logos/bluspring.png", alt: "BluSpring" },
  { src: "/logos/cubit.jpeg", alt: "Cubit" },
  { src: "/logos/smb-connect.jpg", alt: "SMB Connect" },
  { src: "/logos/rb.jpg", alt: "RB" },
];

/** Small uppercase section label — the consistent visual signature across the page. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent mb-4">
      {children}
    </p>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const logo = useTenantLogo();
  const dpoEmail = tenant?.dpo_email || "dpo@company.com";

  const handleTryFree = (location: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag?.('event', 'generate_lead', {
      product_key: 'crm',
      form_type: 'signup',
      cta_location: location,
    });
    navigate('/register');
  };

  const handleRequestDemo = (location: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag?.('event', 'generate_lead', {
      product_key: 'crm',
      form_type: 'demo_request',
      cta_location: location,
    });
    window.open('https://calendly.com/in-sync/demo', '_blank');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Vendor-Sync" className="h-10 w-auto" />
            <div className="leading-tight">
              <span className="block text-lg font-bold tracking-tight text-primary">
                Vendor-Sync
              </span>
              <span className="hidden sm:block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                by In-Sync
              </span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#platform" className="hover:text-foreground transition-colors">Platform</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" onClick={() => navigate("/vendor/portal")}>
              Vendor Login
            </Button>
            <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => navigate("/staff/login")}>
              Login
            </Button>
            <Button onClick={() => handleTryFree('navbar')}>
              Try Free <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-[hsl(204,100%,30%)] to-[hsl(204,100%,18%)] text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent rounded-full blur-3xl" />
        </div>
        <div aria-hidden className="absolute inset-0 bg-grid-white mask-fade-center" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-32">
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-12">
            <motion.div
              initial="hidden"
              animate="visible"
              className="max-w-xl lg:flex-1"
            >
              <motion.div
                variants={fadeUp}
                custom={0}
                className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-sm font-medium mb-8"
              >
                <Sparkles className="h-4 w-4 text-accent" />
                Vendor lifecycle management · 3 free verifications
              </motion.div>

              <motion.h1
                variants={fadeUp}
                custom={1}
                className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.08] tracking-tight mb-6"
              >
                From first invite
                <br />
                <span className="text-accent">to final settlement.</span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-lg sm:text-xl text-white/80 mb-8 max-w-2xl leading-relaxed"
              >
                Vendor-Sync onboards your vendors with verified KYC, collects
                their invoices, and keeps every payment transparent — so your
                team stops chasing documents, and your vendors stop chasing
                payments.
              </motion.p>

              <motion.div
                variants={fadeUp}
                custom={3}
                className="flex flex-col sm:flex-row gap-4 mb-10"
              >
                <Button
                  size="lg"
                  className="bg-accent hover:bg-accent/90 text-white h-14 px-8 text-lg"
                  onClick={() => handleTryFree('hero')}
                >
                  Try Free — 3 Verifications
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
                <Button
                  size="lg"
                  className="border border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white h-14 px-8 text-lg backdrop-blur-sm"
                  onClick={() => handleRequestDemo('hero')}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Request a Demo
                </Button>
              </motion.div>

              {/* Lifecycle strip — the whole story in one glance */}
              <motion.div
                variants={fadeUp}
                custom={4}
                className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-white/70"
              >
                {["Verify", "Onboard", "Invoice", "Settle"].map((stage, i, arr) => (
                  <span key={stage} className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium">
                      {stage}
                    </span>
                    {i < arr.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-white/40" />}
                  </span>
                ))}
              </motion.div>
            </motion.div>

            {/* Walkthrough player */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-12 lg:mt-0 lg:flex-1 w-full lg:scale-125 lg:origin-right"
            >
              <div className="rounded-2xl overflow-hidden border-2 border-white/60 shadow-2xl ring-1 ring-black/5 bg-card aspect-video">
                <ProcessWalkthrough />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Proof band — every number and badge in one place */}
      <section className="relative bg-card border-b border-border overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-dots mask-fade-edges-x opacity-60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 mb-8">
            {STATS.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="text-3xl sm:text-4xl font-bold tracking-tight text-primary">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-border pt-6 text-sm text-muted-foreground">
            {TRUST_BADGES.map((b) => (
              <span key={b.label} className="flex items-center gap-2">
                <b.icon className="h-4 w-4 text-primary/70" />
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Logo Marquee */}
      <section className="relative border-t border-border/50 bg-background py-14 sm:py-16">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-10 text-center text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground"
        >
          Trusted by 100+ businesses across India
        </motion.p>

        <div className="space-y-5 overflow-hidden">
          {[0, 1].map((row) => {
            const rowLogos =
              row === 0
                ? CLIENT_LOGOS.slice(0, Math.ceil(CLIENT_LOGOS.length / 2))
                : CLIENT_LOGOS.slice(Math.ceil(CLIENT_LOGOS.length / 2));
            const doubled = [...rowLogos, ...rowLogos];
            return (
              <div key={row} className="relative flex overflow-hidden">
                <div
                  className={`flex shrink-0 items-center gap-8 ${
                    row === 0 ? "animate-marquee" : "animate-marquee-reverse"
                  }`}
                >
                  {doubled.map((logo, i) => (
                    <div
                      key={`${row}-${i}`}
                      className="flex h-14 w-32 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-background/80 px-4 py-2 grayscale opacity-50 transition-all duration-300 hover:border-border hover:opacity-100 hover:grayscale-0 hover:shadow-md"
                    >
                      <img
                        src={logo.src}
                        alt={logo.alt}
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* The Lifecycle — shown, not told */}
      <section id="platform" className="relative py-20 sm:py-28 bg-secondary overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-dots mask-fade-top opacity-60" />
        <div aria-hidden className="absolute -top-24 right-[-10%] w-[32rem] h-[32rem] rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="absolute top-1/2 left-[-12%] w-[28rem] h-[28rem] rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mb-16"
          >
            <Eyebrow>The Platform</Eyebrow>
            <h2 className="text-3xl sm:text-4xl lg:text-[2.6rem] font-bold tracking-tight text-foreground mb-5 leading-tight">
              One platform for the entire
              <br className="hidden sm:block" /> vendor relationship
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Most tools stop at onboarding. Vendor-Sync stays for the
              relationship — the vendor you verify on day one is the same
              vendor invoicing you on day ninety.
            </p>
          </motion.div>

          <div className="space-y-16 sm:space-y-20">
            {LIFECYCLE.map((stage, i) => {
              const Icon = stage.icon;
              const Vignette = stage.vignette;
              const flip = i % 2 === 1;
              return (
                <motion.div
                  key={stage.step}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5 }}
                  className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-center"
                >
                  <div className={flip ? "lg:order-2" : ""}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <span className="text-xs font-bold tracking-[0.2em] text-muted-foreground/60">
                        STAGE {stage.step} / 05
                      </span>
                    </div>
                    <h3 className="text-2xl sm:text-[1.7rem] font-semibold tracking-tight text-foreground mb-3">
                      {stage.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed mb-5">
                      {stage.desc}
                    </p>
                    <ul className="space-y-2.5">
                      {stage.points.map((point) => (
                        <li key={point} className="flex items-start gap-2.5">
                          <CheckCircle2 className="mt-0.5 shrink-0 h-4 w-4 text-accent" />
                          <span className="text-sm font-medium text-foreground">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={flip ? "lg:order-1" : ""}>
                    <Vignette />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Before / After — the dark mid-page anchor */}
      <section className="relative py-20 sm:py-28 bg-gradient-to-br from-[hsl(210,45%,13%)] via-[hsl(207,55%,16%)] to-[hsl(204,70%,19%)] text-white overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-grid-white mask-fade-center" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <Eyebrow>Why It Matters</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              The week your team gets back
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              {/* The old way stays in the dark */}
              <div className="h-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
                <h3 className="text-xl font-bold text-red-300 mb-6">
                  The old way
                </h3>
                <ul className="space-y-4">
                  {[
                    "Onboarding lives in email threads",
                    "7–10 days chasing documents",
                    "“Any update on my payment?” — weekly",
                    "Payment records in one person's Excel",
                    "Risky vendors found after commitment",
                    "Every audit is a scramble",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-white/60"
                    >
                      <span className="mt-1 shrink-0 w-5 h-5 rounded-full bg-red-400/15 flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-red-400" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              {/* Vendor-Sync is literally the bright side */}
              <div className="h-full rounded-xl bg-card text-foreground shadow-2xl ring-1 ring-white/20 p-8">
                <h3 className="text-xl font-bold text-accent mb-6">
                  With Vendor-Sync
                </h3>
                <ul className="space-y-4">
                  {[
                    "KYC, fraud checks & approvals in one flow",
                    "Vendors submit; AI does the reading",
                    "Vendors notified — the calls stop",
                    "Every settlement visible to both sides",
                    "Risky vendors flagged before you commit",
                    "The audit trail is already written",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 shrink-0 h-5 w-5 text-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works — both journeys, side by side */}
      <section id="how-it-works" className="relative py-20 sm:py-28 bg-background overflow-hidden">
        <div aria-hidden className="absolute top-24 left-1/2 -translate-x-1/2 w-[40rem] h-[24rem] rounded-full bg-primary/[0.05] blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <Eyebrow>How It Works</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
              Two journeys, one portal
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Onboarding runs once per vendor. Invoicing runs for the life of
              the relationship. Vendor-Sync carries both.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Card className="h-full">
                <CardContent className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Verified onboarding</h3>
                      <p className="text-xs text-muted-foreground">Once per vendor · under a week, not 7–10 days per document chase</p>
                    </div>
                  </div>
                  <ol className="space-y-3">
                    {ONBOARDING_TRACK.map((s, i) => (
                      <li key={s.title} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <s.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground">{s.title}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <Card className="h-full border-accent/40">
                <CardContent className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                      <IndianRupee className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Invoicing &amp; settlement</h3>
                      <p className="text-xs text-muted-foreground">Every invoice · both sides see the same truth</p>
                    </div>
                  </div>
                  <ol className="space-y-3">
                    {INVOICING_TRACK.map((s, i) => (
                      <li key={s.title} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <s.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground">{s.title}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-accent bg-accent/10 rounded-full px-4 py-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Repeat — without the follow-up calls
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative py-20 sm:py-28 bg-[hsl(92,40%,93%)] border-y border-border/50 overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Eyebrow>Customers</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
              Trusted by finance leaders
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ delay: i * 0.15 }}
              >
                <Card className="h-full hover:shadow-lg transition-shadow">
                  <CardContent className="p-8">
                    <Quote className="h-8 w-8 text-accent/30 mb-4" />
                    <p className="text-foreground leading-relaxed mb-6 italic">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div>
                      <div className="font-semibold text-foreground">
                        {t.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t.title}, {t.company}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative py-20 sm:py-28 bg-background overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-dots mask-fade-top opacity-60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-4"
          >
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Quarterly subscription, pay-per-verification wallet — the full
              platform on every plan. Run single checks (GST-only, bank-only)
              or the full stack; each counts as one verification.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-flex items-center gap-2 bg-accent/10 text-accent font-semibold rounded-full px-5 py-2 text-sm">
              <Sparkles className="h-4 w-4" />
              3 free verifications on signup — no card required
            </span>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {PRICING.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ delay: i * 0.1 }}
              >
                <Card
                  className={`h-full relative ${
                    plan.popular
                      ? "border-2 border-primary shadow-lg scale-105"
                      : "border border-border"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full">
                      Most Popular
                    </div>
                  )}
                  <CardContent className="p-8 text-center">
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      {plan.desc}
                    </p>
                    <div className="mb-2">
                      <span className="text-4xl font-bold tracking-tight text-foreground flex items-center justify-center">
                        <IndianRupee className="h-7 w-7" />
                        {plan.price}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        /quarter + GST
                      </span>
                    </div>
                    <div className="text-sm font-medium text-primary mb-2">
                      {plan.verifications}
                    </div>
                    <div className="text-xs text-muted-foreground mb-8 flex items-center justify-center gap-1">
                      <Wallet className="h-3 w-3" />
                      Extra: ₹{plan.overage}/verification from wallet
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        className={`w-full h-12 ${
                          plan.popular
                            ? "bg-primary hover:bg-primary/90"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        }`}
                        onClick={() => handleTryFree('pricing')}
                      >
                        Try Free — 3 Verifications
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full h-10 text-sm"
                        onClick={() => handleRequestDemo('pricing')}
                      >
                        Request a Demo
                      </Button>
                    </div>
                    <ul className="mt-8 space-y-3 text-left text-sm">
                      {PLAN_FEATURES.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Wallet info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 max-w-3xl mx-auto"
          >
            <Card className="border-dashed border-2 border-primary/20">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Wallet className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">
                    Wallet for overages
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Exceeded your included verifications? Top up your wallet and
                    keep going. Minimum recharge ₹2,000. Unused balance carries
                    over — no expiry.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-20 sm:py-28 bg-gradient-to-br from-primary via-[hsl(204,100%,30%)] to-[hsl(204,100%,18%)] text-white overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-grid-white mask-fade-center" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-sm font-medium mb-8">
              <Building2 className="h-4 w-4 text-accent" />
              Vendor-Sync — vendor lifecycle management
            </div>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6 leading-tight">
              Every vendor.
              <br />
              <span className="text-accent">Verified to settled.</span>
            </h2>
            <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto leading-relaxed">
              Start with 3 free verifications — no card required. Onboard your
              first vendor today, and make this the last quarter of
              payment-chasing calls.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button
                size="lg"
                className="bg-accent hover:bg-accent/90 text-white h-14 px-10 text-lg"
                onClick={() => handleTryFree('final_cta')}
              >
                Try Free — 3 Verifications
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
              <Button
                size="lg"
                className="border border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white h-14 px-10 text-lg backdrop-blur-sm"
                onClick={() => handleRequestDemo('final_cta')}
              >
                <Play className="h-4 w-4 mr-2" />
                Request a Demo
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Vendor-Sync" className="h-8 w-auto" />
            <span>
              <span className="font-semibold text-foreground">Vendor-Sync</span> by In-Sync — Vendor Lifecycle Management
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/privacy-policy" className="hover:underline">
              Privacy Policy
            </a>
            {dpoEmail && <span>DPO: {dpoEmail}</span>}
          </div>
        </div>
      </footer>
    </div>
  );
}

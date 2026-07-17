import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantLogo } from "@/hooks/useTenantLogo";
import {
  ArrowRight,
  ShieldCheck,
  ScanSearch,
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

/** The lifecycle IS the pitch — five stages, one relationship. */
const LIFECYCLE = [
  {
    step: "01",
    icon: ShieldCheck,
    title: "Onboard with confidence",
    desc: "Invite one vendor or import hundreds. PAN, GST and bank details are verified against live government sources, duplicates and fraud are flagged automatically, and every approval passes through a maker–checker–approver trail.",
    points: ["Live PAN, GST & bank verification", "Fraud & duplicate detection", "Maker–checker–approver audit trail"],
  },
  {
    step: "02",
    icon: KeyRound,
    title: "One portal, zero passwords",
    desc: "Approved vendors log in with a one-time code sent to their registered email or WhatsApp. No credentials to issue, no reset tickets, no shared spreadsheets.",
    points: ["OTP login via email or WhatsApp", "Nothing for IT to provision", "Vendors see their own status, always"],
  },
  {
    step: "03",
    icon: FileText,
    title: "Invoices without the inbox",
    desc: "Vendors upload invoices from their portal. AI reads the document and pre-fills the details, submissions are locked the moment they land, and your team approves or rejects from a single queue.",
    points: ["AI reads & pre-fills every invoice", "Locked after submission — clean audit trail", "One review queue for the whole team"],
  },
  {
    step: "04",
    icon: Landmark,
    title: "Payments everyone can see",
    desc: "Record settlements with the full advance, GST, TDS and payout breakup — or match an entire bank statement to open invoices in one screen. Vendors are notified automatically the moment anything changes.",
    points: ["Advance / GST / TDS / payout breakup", "Match a full bank statement in one screen", "Vendors notified at every step — automatically"],
  },
  {
    step: "05",
    icon: UserCog,
    title: "Details that stay current",
    desc: "Vendors request their own bank and contact updates from the portal. Nothing changes on the record until your team approves — control stays with you, upkeep stays with them.",
    points: ["Self-service change requests", "Staff approval before anything applies", "Every change logged and attributable"],
  },
];

const CAPABILITIES = [
  {
    icon: Brain,
    title: "AI Document Analysis",
    desc: "Reads GST certificates, PAN cards and bank documents, extracts every field, and flags tampering — before a human ever opens the file.",
  },
  {
    icon: ScanSearch,
    title: "Live Government Checks",
    desc: "PAN, GST and bank account verification against live government and financial APIs. Not a form-fill — a verdict.",
  },
  {
    icon: AlertTriangle,
    title: "Fraud & Duplicate Detection",
    desc: "Duplicate GSTs, recycled bank accounts, near-identical company names, tampered documents — caught before commitment, not after.",
  },
  {
    icon: FileText,
    title: "AI-Read Invoices",
    desc: "Vendors upload a PDF or photo; the invoice number, date, amounts and PO reference are extracted and pre-filled. They confirm, you review.",
  },
  {
    icon: Landmark,
    title: "One-Screen Payment Matching",
    desc: "Paste or upload a bank statement — outgoing payments are extracted and matched to open invoices. Confirm once, record everything.",
  },
  {
    icon: BellRing,
    title: "Automatic Vendor Updates",
    desc: "Approved, rejected, paid — vendors hear it from the platform by email and WhatsApp the moment it happens. The follow-up calls stop.",
  },
];

const STATS = [
  { value: "< 5 min", label: "Verification turnaround" },
  { value: "5", label: "Live government API checks" },
  { value: "0", label: "Vendor passwords to manage" },
  { value: "100%", label: "Audit-ready trail" },
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

const ONBOARDING_STEPS = [
  {
    icon: Send,
    title: "You send an invite",
    desc: "Share a unique link with your vendor — or bulk-import hundreds at once. No manual forms on your side.",
  },
  {
    icon: UserCheck,
    title: "Vendor verifies identity",
    desc: "The vendor confirms their mobile and email with a one-time code. Identity comes before anything else.",
  },
  {
    icon: FileText,
    title: "Documents & details submitted",
    desc: "Company details, banking information, GST certificate, PAN, cancelled cheque — collected in one flow, with DPDP consent.",
  },
  {
    icon: Brain,
    title: "AI reads every document",
    desc: "Fields are extracted and cross-checked, tampering is flagged, and each read carries a confidence score.",
  },
  {
    icon: ScanSearch,
    title: "Government APIs confirm",
    desc: "PAN, GST and bank account verified against live government and financial sources.",
  },
  {
    icon: AlertTriangle,
    title: "Fraud flagged automatically",
    desc: "Duplicate GST or PAN, recycled bank accounts, similar company names — surfaced before your reviewer sees the file.",
  },
  {
    icon: ClipboardCheck,
    title: "Reviewer checks & forwards",
    desc: "Your team reviews the AI analysis and documents, then forwards to the approver — or sends back for corrections.",
  },
  {
    icon: BadgeCheck,
    title: "Approver signs off",
    desc: "Final approval, complete audit trail, compliance report ready to download. The vendor is live — portal access and all.",
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

      {/* Stats Bar */}
      <section className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
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
        </div>
      </section>

      {/* Logo Marquee */}
      <section className="relative border-t border-border/50 bg-muted/30 py-14 sm:py-16">
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

      {/* The Lifecycle — the centerpiece */}
      <section id="platform" className="py-20 sm:py-28 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
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
              relationship — because the vendor you verified on day one is the
              same vendor invoicing you on day ninety.
            </p>
          </motion.div>

          <div className="space-y-6">
            {LIFECYCLE.map((stage, i) => {
              const Icon = stage.icon;
              return (
                <motion.div
                  key={stage.step}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.05, duration: 0.5 }}
                >
                  <Card className="border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300 overflow-hidden">
                    <CardContent className="p-0">
                      <div className="grid lg:grid-cols-[1fr,1.1fr] gap-0">
                        <div className="p-8 sm:p-10">
                          <div className="flex items-center gap-4 mb-5">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                              <Icon className="h-6 w-6 text-primary" />
                            </div>
                            <span className="text-sm font-bold tracking-[0.2em] text-muted-foreground/60">
                              STAGE {stage.step}
                            </span>
                          </div>
                          <h3 className="text-2xl font-semibold tracking-tight text-foreground mb-3">
                            {stage.title}
                          </h3>
                          <p className="text-muted-foreground leading-relaxed">
                            {stage.desc}
                          </p>
                        </div>
                        <div className="bg-muted/40 border-t lg:border-t-0 lg:border-l border-border p-8 sm:p-10 flex flex-col justify-center">
                          <ul className="space-y-4">
                            {stage.points.map((point) => (
                              <li key={point} className="flex items-start gap-3">
                                <CheckCircle2 className="mt-0.5 shrink-0 h-5 w-5 text-accent" />
                                <span className="text-foreground font-medium">{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="py-20 sm:py-28 bg-muted/30 border-y border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mb-16"
          >
            <Eyebrow>Under the Hood</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-5">
              The machinery that makes it effortless
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              AI where it saves hours, government APIs where trust matters, and
              automation where people used to chase people.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CAPABILITIES.map((cap, i) => {
              const Icon = cap.icon;
              return (
                <motion.div
                  key={cap.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card className="h-full border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300">
                    <CardContent className="p-8">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold tracking-tight text-foreground mb-2.5">
                        {cap.title}
                      </h3>
                      <p className="text-muted-foreground leading-relaxed text-[15px]">
                        {cap.desc}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Before / After */}
      <section className="py-20 sm:py-28 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <Eyebrow>Why It Matters</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              The week your team gets back
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="border-destructive/30 h-full">
                <CardContent className="p-8">
                  <h3 className="text-xl font-bold text-destructive mb-6">
                    The old way
                  </h3>
                  <ul className="space-y-4">
                    {[
                      "Onboarding scattered across email threads and spreadsheets",
                      "7–10 days chasing documents for every new vendor",
                      "“Any update on my payment?” calls, every single week",
                      "Payment records living in one person's Excel file",
                      "Risky vendors discovered after the money is committed",
                      "Every audit is a scramble",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 text-muted-foreground"
                      >
                        <span className="mt-1 shrink-0 w-5 h-5 rounded-full bg-destructive/10 flex items-center justify-center">
                          <span className="w-2 h-2 rounded-full bg-destructive" />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="border-accent/30 h-full">
                <CardContent className="p-8">
                  <h3 className="text-xl font-bold text-accent mb-6">
                    With Vendor-Sync
                  </h3>
                  <ul className="space-y-4">
                    {[
                      "Verified onboarding — KYC, fraud checks and approvals in one flow",
                      "Vendors submit their own documents; AI does the reading",
                      "Vendors notified automatically — the follow-up calls stop",
                      "Every settlement recorded with its full breakup, visible to both sides",
                      "Financially risky vendors flagged before you commit",
                      "The audit trail is already written. Download it.",
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
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Onboarding, step by step */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-muted/30 border-y border-border/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Eyebrow>How It Works</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
              Verified onboarding, step by step
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From invite to approved vendor — exactly what happens at every
              stage, and none of it on your team&apos;s desk.
            </p>
          </motion.div>

          <div className="relative">
            <div className="absolute left-6 sm:left-8 top-0 bottom-0 w-0.5 bg-border" />

            <div className="space-y-6">
              {ONBOARDING_STEPS.map((step, i) => {
                const Icon = step.icon;
                const isLast = i === ONBOARDING_STEPS.length - 1;
                return (
                  <motion.div
                    key={step.title}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.4, delay: 0.05 }}
                    className="relative flex gap-4 sm:gap-6"
                  >
                    <div className="relative z-10 flex flex-col items-center shrink-0">
                      <div
                        className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl ring-4 ring-background flex items-center justify-center ${
                          isLast ? "bg-accent/15" : "bg-primary/10"
                        }`}
                      >
                        <Icon className={`h-6 w-6 sm:h-7 sm:w-7 ${isLast ? "text-accent" : "text-primary"}`} />
                      </div>
                    </div>

                    <div className="pt-1 sm:pt-3 pb-2 flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xs font-bold text-muted-foreground/50 uppercase tracking-wider">
                          Step {i + 1}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">
                        {step.title}
                      </h3>
                      <p className="text-muted-foreground leading-relaxed text-sm sm:text-base">
                        {step.desc}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex justify-center mt-10"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-accent bg-accent/10 rounded-full px-5 py-2.5">
                <CheckCircle2 className="h-5 w-5" />
                Vendor live — portal, invoicing and payment visibility included.
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 sm:py-28 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From CFOs and procurement heads who verify before they commit.
            </p>
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
      <section id="pricing" className="py-20 sm:py-28 bg-muted/30 border-y border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
              Quarterly subscription, pay-per-verification wallet — and the full
              platform on every plan. Vendor portal, invoices, payments and
              notifications included. Run individual checks — GST-only,
              bank-only, PAN-only — or the full stack; each counts as one
              verification.
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
      <section className="py-20 sm:py-28 bg-gradient-to-br from-primary via-[hsl(204,100%,30%)] to-[hsl(204,100%,18%)] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
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

      {/* Trust Bar */}
      <section className="bg-card border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>256-bit Encryption</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>DPDP Act Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4" />
              <span>Live Government API Checks</span>
            </div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              <span>Complete Audit Trail</span>
            </div>
          </div>
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

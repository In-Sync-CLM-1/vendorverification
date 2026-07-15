import { motion } from "framer-motion";
import {
  Send,
  UserCheck,
  FileText,
  Brain,
  ScanSearch,
  AlertTriangle,
  ClipboardCheck,
  BadgeCheck,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const WORKFLOW_STEPS = [
  {
    icon: Send,
    title: "You Send an Invite",
    desc: "Share a unique link with your vendor. One click — no manual forms to fill on your side.",
    color: "text-blue-600",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
  },
  {
    icon: UserCheck,
    title: "Vendor Verifies Identity",
    desc: "Vendor enters their mobile and email, verifies via OTP. Identity confirmed before anything else.",
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    ring: "ring-indigo-200",
  },
  {
    icon: FileText,
    title: "Documents & Details Submitted",
    desc: "Company details, banking info, GST certificate, PAN card, cancelled cheque — all collected in one go with DPDP consent.",
    color: "text-violet-600",
    bg: "bg-violet-50",
    ring: "ring-violet-200",
  },
  {
    icon: Brain,
    title: "AI Reads Every Document",
    desc: "Our AI extracts data from uploaded documents, cross-checks fields, and flags tampering — with confidence scores.",
    color: "text-pink-600",
    bg: "bg-pink-50",
    ring: "ring-pink-200",
  },
  {
    icon: ScanSearch,
    title: "Government API Verification",
    desc: "PAN, GST, and Bank Account — verified against live government and financial APIs.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    ring: "ring-emerald-200",
  },
  {
    icon: AlertTriangle,
    title: "Fraud Flagged Automatically",
    desc: "Duplicate GST/PAN, similar company names, tampered documents — flagged before they reach your reviewer.",
    color: "text-amber-600",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
  },
  {
    icon: ClipboardCheck,
    title: "Reviewer Reviews & Forwards",
    desc: "Your team reviews the AI analysis, verifies documents, and forwards to the approver — or sends back for corrections.",
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    ring: "ring-cyan-200",
  },
  {
    icon: BadgeCheck,
    title: "Approver Signs Off",
    desc: "Final approval with a complete audit trail. Vendor is onboarded. Your compliance report is ready to download.",
    color: "text-green-600",
    bg: "bg-green-50",
    ring: "ring-green-200",
  },
];

export default function HowItWorksPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            How It Works — Step by Step
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From invite to approved vendor — here's exactly what happens at every stage.
          </p>
        </motion.div>

        <div className="relative">
          <div className="absolute left-6 sm:left-8 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-6">
            {WORKFLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="relative flex gap-4 sm:gap-6"
                >
                  <div className="relative z-10 flex flex-col items-center shrink-0">
                    <div
                      className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl ${step.bg} ring-4 ring-background ${step.ring} flex items-center justify-center`}
                    >
                      <Icon className={`h-6 w-6 sm:h-7 sm:w-7 ${step.color}`} />
                    </div>
                  </div>

                  <div className="pt-1 sm:pt-3 pb-2 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs font-bold text-muted-foreground/50 uppercase tracking-wider">
                        Step {i + 1}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">
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
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: WORKFLOW_STEPS.length * 0.1 + 0.1 }}
            className="flex justify-center mt-8"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-accent bg-accent/10 rounded-full px-5 py-2.5">
              <CheckCircle2 className="h-5 w-5" />
              Vendor verified. Audit trail complete.
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="text-center mt-14"
        >
          <Button size="lg" onClick={() => navigate("/register")}>
            Get Started Free
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

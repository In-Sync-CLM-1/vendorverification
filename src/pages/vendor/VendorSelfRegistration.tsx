import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ConsentStep, CONSENT_VERSION } from "@/components/referral/ConsentStep";
import { CompanyDetailsStep } from "@/components/referral/CompanyDetailsStep";
import { ContactDetailsStep } from "@/components/referral/ContactDetailsStep";
import { BankDetailsStep } from "@/components/referral/BankDetailsStep";
import { SelfRegisterDocUpload } from "@/components/selfregister/SelfRegisterDocUpload";
import { RegistrationSuccess } from "@/components/referral/RegistrationSuccess";
import { ReferralStepper } from "@/components/referral/ReferralStepper";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantLogo } from "@/hooks/useTenantLogo";

const STORAGE_KEY = "vendor_self_register_form_state";

type PageState = "form" | "submitting" | "success";

function generateSessionId(): string {
  return crypto.randomUUID();
}

export default function VendorSelfRegistration() {
  const navigate = useNavigate();
  const { tenant } = useTenant();

  // Generate or restore session ID for document uploads
  const [sessionId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.sessionId) return parsed.sessionId;
      } catch { /* ignore parse errors */ }
    }
    return generateSessionId();
  });

  const [pageState, setPageState] = useState<PageState>("form");
  const [currentStep, setCurrentStep] = useState(0);
  const [consented, setConsented] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<Set<string>>(new Set());
  const [uploadedDocFiles, setUploadedDocFiles] = useState<Record<string, { file_path: string; file_name: string; file_size: number }>>({});
  const [categoryDocs, setCategoryDocs] = useState<Record<string, unknown>[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const [formData, setFormData] = useState({
    company_name: "",
    trade_name: "",
    gst_number: "",
    pan_number: "",
    category_id: "",
    salutation: "",
    constitution_type: "",
    primary_contact_name: "",
    primary_mobile: "",
    primary_email: "",
    bank_name: "",
    bank_branch: "",
    bank_account_number: "",
    bank_ifsc: "",
  });

  // Sign out any existing session to prevent RLS bleed
  useEffect(() => {
    supabase.auth.signOut();
  }, []);

  // Load categories and restore saved state on mount
  useEffect(() => {
    if (!tenant?.id) return;
    const init = async () => {
      const { data: cats } = await supabase
        .from("vendor_categories")
        .select("id, name")
        .eq("is_active", true)
        .eq("tenant_id", tenant.id);
      setCategories(cats || []);

      // Restore from localStorage
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.sessionId === sessionId) {
            setFormData(parsed.formData);
            setCurrentStep(parsed.currentStep || 0);
            setConsented(parsed.consented || false);
            setPhoneVerified(parsed.phoneVerified || false);
            setEmailVerified(parsed.emailVerified || false);
            setUploadedDocs(new Set(parsed.uploadedDocs || []));
            setUploadedDocFiles(parsed.uploadedDocFiles || {});
            if (parsed.formData.category_id) {
              loadCategoryDocs(parsed.formData.category_id);
            }
          }
        } catch { /* ignore parse errors */ }
      }
    };
    init();
  }, [sessionId, tenant?.id]);

  const loadCategoryDocs = async (categoryId: string) => {
    const { data } = await supabase
      .from("category_documents")
      .select("*, document_types(*)")
      .eq("category_id", categoryId)
      .order("display_order");
    setCategoryDocs(data || []);
  };

  // Load docs when category changes
  useEffect(() => {
    if (formData.category_id) {
      loadCategoryDocs(formData.category_id);
    } else {
      setCategoryDocs([]);
    }
  }, [formData.category_id]);

  // Persist state to localStorage
  useEffect(() => {
    if (pageState !== "form") return;
    const payload = {
      sessionId,
      formData,
      currentStep,
      consented,
      phoneVerified,
      emailVerified,
      uploadedDocs: Array.from(uploadedDocs),
      uploadedDocFiles,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [formData, currentStep, consented, phoneVerified, emailVerified, uploadedDocs, uploadedDocFiles, pageState, sessionId]);

  const handleFieldChange = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return consented;
      case 1:
        return formData.company_name.trim().length > 0 && formData.category_id.length > 0;
      case 2:
        return (
          formData.primary_contact_name.trim().length > 0 &&
          formData.primary_mobile.replace(/\D/g, "").length === 10 &&
          phoneVerified &&
          formData.primary_email.trim().length > 0 &&
          emailVerified
        );
      case 3:
        return (
          formData.bank_name.trim().length > 0 &&
          formData.bank_branch.trim().length > 0 &&
          formData.bank_account_number.trim().length > 0 &&
          formData.bank_ifsc.trim().length > 0
        );
      case 4: {
        const mandatory = categoryDocs.filter((d) => d.is_mandatory);
        return mandatory.every((d) => uploadedDocs.has(d.document_type_id));
      }
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 4) setCurrentStep((s) => s + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    setPageState("submitting");
    try {
      const { data, error } = await supabase.functions.invoke("submit-vendor-self-register", {
        body: {
          session_id: sessionId,
          tenant_id: tenant?.id,
          consent_version: CONSENT_VERSION,
          formData: {
            ...formData,
            primary_mobile: `+91${formData.primary_mobile.replace(/\D/g, "")}`,
          },
          documents: Object.entries(uploadedDocFiles).map(([docTypeId, info]) => ({
            document_type_id: docTypeId,
            file_path: info.file_path,
            file_name: info.file_name,
            file_size: info.file_size,
          })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      localStorage.removeItem(STORAGE_KEY);
      setPageState("success");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Submission failed. Please try again.");
      setPageState("form");
    }
  };

  const selectedCategoryName = categories.find((c) => c.id === formData.category_id)?.name || "";

  // --- RENDER ---

  if (pageState === "submitting") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SelfRegisterHeader currentStep={0} />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Submitting your registration...</p>
        </div>
      </div>
    );
  }

  if (pageState === "success") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SelfRegisterHeader currentStep={0} />
        <RegistrationSuccess />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SelfRegisterHeader currentStep={currentStep} onBack={() => navigate("/")} />

      <div className="flex-1 overflow-y-auto pb-24">
        {currentStep === 0 && (
          <ConsentStep consented={consented} onConsentChange={setConsented} />
        )}
        {currentStep === 1 && (
          <CompanyDetailsStep
            formData={formData}
            categoryName={selectedCategoryName}
            categories={categories}
            onChange={handleFieldChange}
          />
        )}
        {currentStep === 2 && (
          <ContactDetailsStep
            formData={formData}
            phoneVerified={phoneVerified}
            emailVerified={emailVerified}
            onChange={handleFieldChange}
            onPhoneVerified={() => setPhoneVerified(true)}
            onEmailVerified={() => setEmailVerified(true)}
          />
        )}
        {currentStep === 3 && (
          <BankDetailsStep formData={formData} onChange={handleFieldChange} />
        )}
        {currentStep === 4 && (
          <SelfRegisterDocUpload
            categoryDocs={categoryDocs}
            sessionId={sessionId}
            uploadedDocs={uploadedDocs}
            onDocUploaded={(id, filePath, fileName, fileSize) => {
              setUploadedDocs((prev) => new Set(prev).add(id));
              setUploadedDocFiles((prev) => ({ ...prev, [id]: { file_path: filePath, file_name: fileName, file_size: fileSize } }));
            }}
          />
        )}
      </div>

      {/* Fixed bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-6 flex gap-4 safe-area-inset">
        {currentStep > 0 && (
          <Button variant="outline" className="h-16 flex-1 text-lg" onClick={handleBack}>
            <ArrowLeft className="h-6 w-6 mr-2" />
            Back
          </Button>
        )}
        {currentStep < 4 ? (
          <Button className="h-16 flex-1 text-lg" onClick={handleNext} disabled={!canProceed()}>
            Next
            <ArrowRight className="h-6 w-6 ml-2" />
          </Button>
        ) : (
          <Button className="h-16 flex-1 text-lg" onClick={handleSubmit} disabled={!canProceed()}>
            Submit Registration
          </Button>
        )}
      </div>
    </div>
  );
}

function SelfRegisterHeader({ currentStep, onBack }: { currentStep: number; onBack?: () => void }) {
  const logo = useTenantLogo();
  const { tenant } = useTenant();

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
      <div className="flex items-center gap-3 px-4 py-2">
        {onBack && (
          <button
            onClick={onBack}
            className="shrink-0 p-1 rounded-md hover:bg-muted transition-colors"
            aria-label="Back to home"
          >
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </button>
        )}
        <a href="/">
          <img
            src={logo}
            alt={tenant?.short_name || "Vendor Verification Portal"}
            className="h-8 object-contain shrink-0"
          />
        </a>
        <h1 className="text-sm font-semibold text-primary whitespace-nowrap">
          Vendor Registration
        </h1>
        <div className="flex-1 min-w-0">
          <ReferralStepper currentStep={currentStep} />
        </div>
      </div>
    </header>
  );
}

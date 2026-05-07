import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ReferralHeader } from "@/components/referral/ReferralHeader";
import { RegistrationSuccess } from "@/components/referral/RegistrationSuccess";
import { ConsentStep, CONSENT_VERSION } from "@/components/referral/ConsentStep";
import { CompanyDetailsStep } from "@/components/referral/CompanyDetailsStep";
import { ContactDetailsStep } from "@/components/referral/ContactDetailsStep";
import { BankDetailsStep } from "@/components/referral/BankDetailsStep";
import { DocumentUploadStep } from "@/components/referral/DocumentUploadStep";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "vendor_referral_form_state";

type PageState = "loading" | "invalid" | "form" | "submitting" | "success";

export default function VendorReferralRegistration() {
  const { token } = useParams<{ token: string }>();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralTenantId, setReferralTenantId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0); // Start at consent step
  const [consented, setConsented] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<Set<string>>(new Set());
  const [uploadedDocFiles, setUploadedDocFiles] = useState<Record<string, { file_path: string; file_name: string; file_size: number }>>({})
  const [categoryDocs, setCategoryDocs] = useState<any[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

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

  // Validate referral code on mount
  useEffect(() => {
    if (!token) {
      setErrorMessage("No referral code provided.");
      setPageState("invalid");
      return;
    }
    validateReferralCode(token);
  }, [token]);

  const validateReferralCode = async (code: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("validate-referral-code", {
        body: { referral_code: code },
      });

      if (error || !data?.valid) {
        setErrorMessage("This referral link is invalid or inactive.");
        setPageState("invalid");
        return;
      }

      setReferralCode(code);
      const tenantId: string | null = data?.tenant_id ?? null;
      setReferralTenantId(tenantId);

      // Load categories for the dropdown — scoped to the referring tenant
      let catsQuery = supabase
        .from("vendor_categories")
        .select("id, name")
        .eq("is_active", true);
      if (tenantId) catsQuery = catsQuery.eq("tenant_id", tenantId);
      const { data: cats } = await catsQuery;
      setCategories(cats || []);

      // Restore from localStorage
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed._token === code) {
            setFormData(parsed.formData);
            setCurrentStep(parsed.currentStep || 0);
            setConsented(parsed.consented || false);
            setPhoneVerified(parsed.phoneVerified || false);
            setEmailVerified(parsed.emailVerified || false);
            setUploadedDocs(new Set(parsed.uploadedDocs || []));
            if (parsed.formData.category_id) {
              loadCategoryDocs(parsed.formData.category_id);
            }
            setPageState("form");
            return;
          }
        } catch {}
      }

      setPageState("form");
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      setPageState("invalid");
    }
  };

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
    if (pageState !== "form" || !token) return;
    const payload = {
      _token: token,
      formData,
      currentStep,
      consented,
      phoneVerified,
      emailVerified,
      uploadedDocs: Array.from(uploadedDocs),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [formData, currentStep, consented, phoneVerified, emailVerified, uploadedDocs, pageState, token]);

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
    if (!referralCode || !token) return;
    setPageState("submitting");
    try {
      const { data, error } = await supabase.functions.invoke("submit-vendor-referral", {
        body: {
          referral_code: referralCode,
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
    } catch (err: any) {
      toast.error(err.message || "Submission failed. Please try again.");
      setPageState("form");
    }
  };

  // --- RENDER ---

  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ReferralHeader currentStep={0} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (pageState === "invalid") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ReferralHeader currentStep={0} />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="h-16 w-16 text-warning mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Link Unavailable</h2>
          <p className="text-muted-foreground max-w-sm">{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (pageState === "submitting") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ReferralHeader currentStep={0} />
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
        <ReferralHeader currentStep={0} />
        <RegistrationSuccess />
      </div>
    );
  }

  // Form state
  const selectedCategoryName = categories.find((c) => c.id === formData.category_id)?.name || "";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ReferralHeader currentStep={currentStep} />

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
          <DocumentUploadStep
            categoryDocs={categoryDocs}
            token={token || ""}
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

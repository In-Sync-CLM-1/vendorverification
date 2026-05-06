import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { useVendorProfile, useVendorDocuments, useSubmitVendorApplication } from "@/hooks/useVendor";
import { useCategoryDocuments } from "@/hooks/useVendorData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  ChevronRight,
  Building2,
  Send,
  XCircle,
  Loader2,
  Download,
  Trash2,
  ShieldOff,
  UserPlus,
  ShieldCheck
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-muted", icon: FileText },
  pending_review: { label: "Pending Review", color: "bg-warning/20 text-warning", icon: Clock },
  in_verification: { label: "In Verification", color: "bg-primary/20 text-primary", icon: FileText },
  pending_approval: { label: "Pending Approval", color: "bg-accent/20 text-accent", icon: Clock },
  sent_back: { label: "Sent Back", color: "bg-orange-100 text-orange-700", icon: AlertCircle },
  approved: { label: "Approved", color: "bg-success/20 text-success", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-destructive/20 text-destructive", icon: XCircle },
  consent_withdrawn: { label: "Consent Withdrawn", color: "bg-muted", icon: ShieldOff },
};

function DataRightsSection({ vendor, user }: { vendor: any; user: any }) {
  const [showNominee, setShowNominee] = useState(false);
  const [nomineeName, setNomineeName] = useState(vendor.nominee_name || "");
  const [nomineeContact, setNomineeContact] = useState(vendor.nominee_contact || "");
  const [loading, setLoading] = useState("");

  const handleDownloadData = async () => {
    setLoading("download");
    try {
      const [vendorRes, docsRes, historyRes] = await Promise.all([
        supabase.from("vendors").select("*").eq("id", vendor.id).single(),
        supabase.from("vendor_documents").select("id, file_name, document_type_id, status, created_at, expiry_date").eq("vendor_id", vendor.id),
        supabase.from("workflow_history").select("*").eq("vendor_id", vendor.id),
      ]);
      
      // Log the data request
      await supabase.from("data_requests").insert({
        vendor_id: vendor.id,
        requested_by: user.id,
        request_type: "access",
        tenant_id: vendor.tenant_id,
      });

      const blob = new Blob([JSON.stringify({
        vendor_profile: vendorRes.data,
        documents: docsRes.data,
        workflow_history: historyRes.data,
        exported_at: new Date().toISOString(),
      }, null, 2)], { type: "application/json" });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-data-${vendor.vendor_code || vendor.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data downloaded successfully");
    } catch {
      toast.error("Failed to download data");
    }
    setLoading("");
  };

  const handleErasureRequest = async () => {
    setLoading("erasure");
    try {
      await supabase.from("data_requests").insert({
        vendor_id: vendor.id,
        requested_by: user.id,
        request_type: "erasure",
        tenant_id: vendor.tenant_id,
      });
      toast.success("Erasure request submitted. We will respond within 90 days.");
    } catch {
      toast.error("Failed to submit request");
    }
    setLoading("");
  };

  const handleWithdrawConsent = async () => {
    setLoading("withdraw");
    try {
      // Update consent record
      await supabase.from("consent_records")
        .update({ withdrawn_at: new Date().toISOString() })
        .eq("vendor_id", vendor.id)
        .is("withdrawn_at", null);
      
      // Update vendor status
      await supabase.from("vendors")
        .update({ current_status: "consent_withdrawn" as any })
        .eq("id", vendor.id);

      toast.success("Consent withdrawn. Data processing will stop.");
      window.location.reload();
    } catch {
      toast.error("Failed to withdraw consent");
    }
    setLoading("");
  };

  const handleSaveNominee = async () => {
    setLoading("nominee");
    try {
      await supabase.from("vendors")
        .update({ nominee_name: nomineeName, nominee_contact: nomineeContact } as any)
        .eq("id", vendor.id);
      
      await supabase.from("data_requests").insert({
        vendor_id: vendor.id,
        requested_by: user.id,
        request_type: "nomination",
        tenant_id: vendor.tenant_id,
      });
      
      toast.success("Nominee saved");
      setShowNominee(false);
    } catch {
      toast.error("Failed to save nominee");
    }
    setLoading("");
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            My Data Rights (DPDP Act)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-start h-10" onClick={handleDownloadData} disabled={loading === "download"}>
            {loading === "download" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Download My Data
          </Button>
          <Button variant="outline" className="w-full justify-start h-10" onClick={handleErasureRequest} disabled={loading === "erasure"}>
            {loading === "erasure" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Request Data Erasure
          </Button>
          <Button variant="outline" className="w-full justify-start h-10" onClick={() => setShowNominee(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Manage Nominee
          </Button>
          <Button variant="outline" className="w-full justify-start h-10 text-destructive hover:text-destructive" onClick={handleWithdrawConsent} disabled={loading === "withdraw"}>
            {loading === "withdraw" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldOff className="h-4 w-4 mr-2" />}
            Withdraw Consent
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showNominee} onOpenChange={setShowNominee}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage Nominee</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Under the DPDP Act, you can nominate someone to exercise your data rights on your behalf.</p>
          <div className="space-y-3">
            <div><Label>Nominee Name</Label><Input value={nomineeName} onChange={(e) => setNomineeName(e.target.value)} placeholder="Full name" /></div>
            <div><Label>Nominee Contact (Phone/Email)</Label><Input value={nomineeContact} onChange={(e) => setNomineeContact(e.target.value)} placeholder="Phone or email" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNominee(false)}>Cancel</Button>
            <Button onClick={handleSaveNominee} disabled={!nomineeName || !nomineeContact || loading === "nominee"}>
              {loading === "nominee" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Nominee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function VendorDashboard() {
  const { user, userType, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: vendor, isLoading: vendorLoading } = useVendorProfile();
  const { data: documents } = useVendorDocuments(vendor?.id || null);
  const { data: categoryDocs } = useCategoryDocuments(vendor?.category_id || null);
  const submitApplication = useSubmitVendorApplication();

  useEffect(() => {
    if (!loading && (!user || userType !== "vendor")) {
      navigate("/vendor/login");
    }
  }, [user, userType, loading, navigate]);

  if (loading || vendorLoading) {
    return (
      <MobileLayout title="Dashboard">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MobileLayout>
    );
  }

  // If no vendor profile, redirect to registration
  if (!vendor) {
    return (
      <MobileLayout title="Dashboard">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Welcome</h2>
          <p className="text-muted-foreground mb-6">
            Complete your vendor registration to get started
          </p>
          <Button onClick={() => navigate("/vendor/register")} size="lg">
            Start Registration
          </Button>
        </div>
      </MobileLayout>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const statusConfig = STATUS_CONFIG[vendor.current_status];
  const StatusIcon = statusConfig.icon;

  // Calculate document status
  const uploadedDocIds = new Set(documents?.map(d => d.document_type_id) || []);
  const mandatoryDocs = categoryDocs?.filter(d => d.is_mandatory) || [];
  const uploadedMandatory = mandatoryDocs.filter(d => uploadedDocIds.has(d.document_type_id));
  const missingMandatory = mandatoryDocs.length - uploadedMandatory.length;

  const canSubmit = vendor.current_status === "draft" && missingMandatory === 0;

  return (
    <MobileLayout title="My Dashboard">
      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Vendor Code & Status */}
        <Card className={statusConfig.color}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-background flex items-center justify-center">
                <StatusIcon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm opacity-80">Application Status</p>
                <p className="font-semibold text-lg">{statusConfig.label}</p>
                {vendor.vendor_code && (
                  <p className="text-xs opacity-70">Code: {vendor.vendor_code}</p>
                )}
              </div>
            </div>
            
            {vendor.current_status === "rejected" && vendor.rejection_reason && (
              <div className="mt-3 p-3 bg-background rounded-lg">
                <p className="text-sm font-medium text-destructive">Rejection Reason:</p>
                <p className="text-sm">{vendor.rejection_reason}</p>
              </div>
            )}
            {(vendor.current_status as string) === "sent_back" && (vendor as any).sent_back_reason && (
              <div className="mt-3 p-3 bg-background rounded-lg">
                <p className="text-sm font-medium text-orange-700">Corrections Required:</p>
                <p className="text-sm">{(vendor as any).sent_back_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Company Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Company Name</span>
              <span className="text-sm font-medium">{vendor.company_name}</span>
            </div>
            {vendor.gst_number && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">GST Number</span>
                <span className="text-sm font-medium">{vendor.gst_number}</span>
              </div>
            )}
            {vendor.pan_number && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">PAN Number</span>
                <span className="text-sm font-medium">{vendor.pan_number}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sent Back: Resubmit Actions */}
        {(vendor.current_status as string) === "sent_back" && (
          <Card className="border-orange-300 bg-orange-50">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-orange-800 font-medium">Your application has been sent back for corrections. Please review the feedback above and resubmit.</p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => navigate("/vendor/register")}>
                  <FileText className="h-4 w-4 mr-2" /> Edit Details
                </Button>
                <Button variant="outline" onClick={() => navigate("/vendor/documents")}>
                  <AlertCircle className="h-4 w-4 mr-2" /> Documents
                </Button>
              </div>
              <Button 
                className="w-full h-12"
                onClick={() => submitApplication.mutate(vendor.id)}
                disabled={submitApplication.isPending}
              >
                {submitApplication.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Resubmit for Review
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        {vendor.current_status === "draft" && (
          <div className="grid grid-cols-2 gap-3">
            <Card 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate("/vendor/register")}
            >
              <CardContent className="p-4 text-center">
                <FileText className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="font-medium text-sm">Edit Details</p>
              </CardContent>
            </Card>
            
            <Card 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate("/vendor/documents")}
            >
              <CardContent className="p-4 text-center">
                <AlertCircle className={`h-8 w-8 mx-auto mb-2 ${missingMandatory > 0 ? 'text-destructive' : 'text-success'}`} />
                <p className="font-medium text-sm">Documents</p>
                <p className="text-xs text-muted-foreground">
                  {missingMandatory > 0 ? `${missingMandatory} missing` : 'All uploaded'}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Document Checklist */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Document Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {categoryDocs?.map((doc) => {
              const isUploaded = uploadedDocIds.has(doc.document_type_id);
              const uploadedDoc = documents?.find(d => d.document_type_id === doc.document_type_id);
              
              return (
                <div 
                  key={doc.id}
                  className={`flex items-center gap-3 p-2 rounded-lg ${
                    isUploaded ? 'bg-success/10' : doc.is_mandatory ? 'bg-destructive/10' : 'bg-muted'
                  }`}
                >
                  {isUploaded ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  ) : doc.is_mandatory ? (
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                  ) : (
                    <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <span className="flex-1 text-sm">{doc.document_types.name}</span>
                  {isUploaded ? (
                    <Badge variant="outline" className="text-xs bg-success/10">Uploaded</Badge>
                  ) : doc.is_mandatory ? (
                    <Badge variant="destructive" className="text-xs">Required</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Optional</Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Submit Button */}
        {vendor.current_status === "draft" && (
          <Button 
            className="w-full h-12"
            onClick={() => submitApplication.mutate(vendor.id)}
            disabled={!canSubmit || submitApplication.isPending}
          >
            {submitApplication.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit for Review
              </>
            )}
          </Button>
        )}

        {!canSubmit && vendor.current_status === "draft" && (
          <p className="text-sm text-center text-muted-foreground">
            Upload all mandatory documents to submit your application
          </p>
        )}

        {/* Data Rights Section */}
        <DataRightsSection vendor={vendor} user={user} />

        {/* Sign Out */}
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </MobileLayout>
  );
}

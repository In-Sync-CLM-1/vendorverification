import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useUserRoles } from "@/hooks/useUserRoles";
import { 
  useVendorDetails, 
  useVendorDocumentsForReview, 
  useUpdateVendorStatus,
  useUpdateDocumentStatus 
} from "@/hooks/useStaffWorkflow";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentAnalysesBatch, type ExtractedField } from "@/hooks/useDocumentAnalysis";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { VerificationPanel } from "@/components/staff/VerificationPanel";
import { 
  Building2, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  ArrowRight,
  ExternalLink,
  Loader2,
  AlertTriangle,
  User,
  CreditCard,
  Phone,
  Mail,
  MapPin,
  Sparkles
} from "lucide-react";

const PII_FIELDS = ["pan", "pan_number", "bank_account", "bank_account_number", "account_number", "mobile", "phone", "mobile_number"];

function maskPiiValue(fieldName: string, value: string): string {
  const lowerField = fieldName.toLowerCase();
  if (lowerField.includes("pan")) {
    // Show first 2 + last 2: AB***78C
    if (value.length >= 4) return value.slice(0, 2) + "***" + value.slice(-2);
  }
  if (lowerField.includes("account") || lowerField.includes("bank_account")) {
    // Show last 4 only
    if (value.length >= 4) return "****" + value.slice(-4);
  }
  if (lowerField.includes("mobile") || lowerField.includes("phone")) {
    if (value.length >= 4) return "****" + value.slice(-4);
  }
  return value;
}

function isPiiField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return PII_FIELDS.some(p => lower.includes(p));
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  pending_approval: "Pending Approval",
  sent_back: "Sent Back",
  approved: "Approved",
  rejected: "Rejected",
};

const DOC_STATUS_COLORS = {
  uploaded: "bg-muted",
  under_review: "bg-warning/20 text-warning",
  approved: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
  expired: "bg-destructive/20 text-destructive",
};

export default function VendorReviewDetail() {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isMaker, isApprover } = useUserRoles();
  const isReviewer = isMaker;

  const { data: vendor, isLoading: vendorLoading } = useVendorDetails(vendorId || null);
  const { data: documents, isLoading: docsLoading } = useVendorDocumentsForReview(vendorId || null);

  const updateVendorStatus = useUpdateVendorStatus();
  const updateDocumentStatus = useUpdateDocumentStatus();

  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showSendBackDialog, setShowSendBackDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [sendBackReason, setSendBackReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const documentIds = useMemo(() => (documents || []).map(d => d.id), [documents]);
  const { analysesMap } = useDocumentAnalysesBatch(documentIds);

  // Store vendor ID for DigiLocker callback
  useEffect(() => {
    if (vendor?.id) {
      sessionStorage.setItem("current_vendor_id", vendor.id);
    }
  }, [vendor?.id]);

  if (vendorLoading || docsLoading) {
    return (
      <StaffLayout title="Vendor Details">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StaffLayout>
    );
  }

  if (!vendor) {
    return (
      <StaffLayout title="Vendor Details">
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-muted-foreground">Vendor not found</p>
        </div>
      </StaffLayout>
    );
  }

  const canForward =
    (isReviewer && vendor.current_status === "pending_review") ||
    isAdmin;

  const canApprove =
    (isApprover && vendor.current_status === "pending_approval") ||
    isAdmin;

  const canReject = canForward || canApprove;

  const canSendBack =
    (isReviewer && vendor.current_status === "pending_review") ||
    isAdmin;

  const getNextStatus = () => {
    if (vendor.current_status === "pending_review") return "pending_approval";
    if (vendor.current_status === "pending_approval") return "approved";
    return null;
  };

  const handleForward = async () => {
    const nextStatus = getNextStatus();
    if (!nextStatus) return;
    setActionLoading("forward");
    try {
      await updateVendorStatus.mutateAsync({
        vendorId: vendor.id,
        newStatus: nextStatus as any,
      });
      navigate("/staff/queue");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActionLoading("reject");
    try {
      await updateVendorStatus.mutateAsync({
        vendorId: vendor.id,
        newStatus: "rejected",
        comments: rejectReason,
      });
      setShowRejectDialog(false);
      navigate("/staff/queue");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDocumentAction = async (docId: string, status: "approved" | "rejected") => {
    setActionLoading(docId);
    try {
      await updateDocumentStatus.mutateAsync({ documentId: docId, status });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <StaffLayout title="Review Vendor">
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4 max-w-3xl">
        {/* Header */}
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <Building2 className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg">{vendor.company_name}</p>
                <p className="text-sm opacity-80">{vendor.vendor_code}</p>
              </div>
              <Badge className="bg-white/20">
                {STATUS_LABELS[vendor.current_status]}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Company Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Company Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {vendor.trade_name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trade Name</span>
                <span className="font-medium">{vendor.trade_name}</span>
              </div>
            )}
            {vendor.gst_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST Number</span>
                <span className="font-medium font-mono">{vendor.gst_number}</span>
              </div>
            )}
            {vendor.pan_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">PAN Number</span>
                <span className="font-medium font-mono">{vendor.pan_number}</span>
              </div>
            )}
            {vendor.cin_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CIN Number</span>
                <span className="font-medium font-mono">{vendor.cin_number}</span>
              </div>
            )}
            {(vendor as any).salutation && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Salutation</span>
                <span className="font-medium">{(vendor as any).salutation}</span>
              </div>
            )}
            {(vendor as any).constitution_type && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Business Type</span>
                <span className="font-medium">{(vendor as any).constitution_type}</span>
              </div>
            )}
            {vendor.registered_address && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground flex items-center gap-1 mb-1">
                  <MapPin className="h-3 w-3" /> Registered Address
                </p>
                <p>{vendor.registered_address}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Primary Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{vendor.primary_contact_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{vendor.primary_mobile}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{vendor.primary_email}</span>
            </div>
          </CardContent>
        </Card>

        {/* Banking Details */}
        {vendor.bank_name && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Banking Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bank</span>
                <span className="font-medium">{vendor.bank_name}</span>
              </div>
              {vendor.bank_branch && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Branch</span>
                  <span className="font-medium">{vendor.bank_branch}</span>
                </div>
              )}
              {vendor.bank_account_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account No.</span>
                  <span className="font-medium font-mono">
                    {'•'.repeat(vendor.bank_account_number.length - 4)}{vendor.bank_account_number.slice(-4)}
                  </span>
                </div>
              )}
              {vendor.bank_ifsc && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IFSC</span>
                  <span className="font-medium font-mono">{vendor.bank_ifsc}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Verification Panel */}
        <VerificationPanel
          vendorId={vendor.id}
          gstin={vendor.gst_number}
          panNumber={vendor.pan_number}
          bankAccountNumber={vendor.bank_account_number}
          bankIfsc={vendor.bank_ifsc}
        />

        {/* Documents */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents ({documents?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {documents?.map((doc) => {
              const analysis = analysesMap[doc.id];
              const extractedFields = analysis?.extracted_data?.slice(0, 3) || [];
              const hasAnalysis = analysis && analysis.analysis_status === "completed";
              const isAnalyzing = analysis?.analysis_status === "processing";

              return (
                <div key={doc.id} className={`p-3 rounded-lg ${DOC_STATUS_COLORS[doc.status]}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{doc.document_types?.name ?? "Document"}</span>
                    <div className="flex items-center gap-1.5">
                      {hasAnalysis && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                          <Sparkles className="h-2.5 w-2.5" />
                          AI {analysis.confidence_score}%
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs capitalize">
                        {doc.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>

                  {/* Inline parsed data */}
                  {hasAnalysis && extractedFields.length > 0 && (
                    <div className="mt-1.5 mb-2 space-y-0.5">
                      {extractedFields.map((field: ExtractedField, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">
                            {field.field_name.replace(/_/g, " ")}
                          </span>
                          <span className="font-mono font-medium">
                            {field.extracted_value
                              ? isPiiField(field.field_name)
                                ? maskPiiValue(field.field_name, field.extracted_value)
                                : field.extracted_value
                              : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No analysis yet - auto-pending state */}
                  {!hasAnalysis && !isAnalyzing && (
                    <div className="mt-1.5 mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Analysis pending…
                    </div>
                  )}

                  {isAnalyzing && (
                    <div className="mt-1.5 mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={async () => {
                      if (doc.file_url.startsWith("http")) {
                        window.open(doc.file_url, "_blank");
                      } else {
                        const { data } = await supabase.storage
                          .from("vendor-documents")
                          .createSignedUrl(doc.file_url, 300);
                        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                      }
                    }}>
                      <ExternalLink className="h-3 w-3 mr-1" /> View
                    </Button>
                    {doc.status !== "approved" && canForward && (
                      <Button variant="outline" size="sm" className="text-success border-success" onClick={() => handleDocumentAction(doc.id, "approved")} disabled={actionLoading === doc.id}>
                        {actionLoading === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      </Button>
                    )}
                    {doc.status !== "rejected" && canForward && (
                      <Button variant="outline" size="sm" className="text-destructive border-destructive" onClick={() => handleDocumentAction(doc.id, "rejected")} disabled={actionLoading === doc.id}>
                        {actionLoading === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {(!documents || documents.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">No documents uploaded yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      {(canForward || canApprove || canReject) && vendor.current_status !== "approved" && vendor.current_status !== "rejected" && (vendor.current_status as string) !== "sent_back" && (
        <div className="p-4 border-t bg-card flex flex-wrap gap-3">
          <Button variant="outline" className="text-destructive border-destructive" onClick={() => setShowRejectDialog(true)}>
            <XCircle className="h-4 w-4 mr-2" /> Reject
          </Button>
          {canSendBack && (
            <Button variant="outline" className="text-orange-600 border-orange-400" onClick={() => setShowSendBackDialog(true)}>
              <ArrowRight className="h-4 w-4 mr-2 rotate-180" /> Send Back
            </Button>
          )}
          <div className="flex-1" />
          {canApprove && vendor.current_status === "pending_approval" ? (
            <Button className="bg-success hover:bg-success/90" onClick={handleForward} disabled={actionLoading === "forward"}>
              {actionLoading === "forward" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Approve</>}
            </Button>
          ) : canForward ? (
            <Button onClick={handleForward} disabled={actionLoading === "forward"}>
              {actionLoading === "forward" ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Forward <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
          ) : null}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Reject Application
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please provide a reason for rejecting this vendor application.</p>
            <Textarea placeholder="Enter rejection reason..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || actionLoading === "reject"}>
              {actionLoading === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Back Dialog */}
      <Dialog open={showSendBackDialog} onOpenChange={setShowSendBackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" /> Send Back for Corrections
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please describe what needs to be corrected. The vendor will be notified and can resubmit.</p>
            <Textarea placeholder="Enter reason for sending back..." value={sendBackReason} onChange={(e) => setSendBackReason(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendBackDialog(false)}>Cancel</Button>
            <Button 
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={async () => {
                if (!sendBackReason.trim()) return;
                setActionLoading("sendback");
                try {
                  await updateVendorStatus.mutateAsync({
                    vendorId: vendor.id,
                    newStatus: "sent_back" as any,
                    comments: sendBackReason,
                  });
                  setShowSendBackDialog(false);
                  navigate("/staff/queue");
                } finally {
                  setActionLoading(null);
                }
              }}
              disabled={!sendBackReason.trim() || actionLoading === "sendback"}
            >
              {actionLoading === "sendback" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Send Back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StaffLayout>
  );
}

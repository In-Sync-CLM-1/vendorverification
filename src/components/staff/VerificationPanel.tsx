import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useVendorVerifications,
  useVerifyPan,
  useVerifyGst,
  useVerifyBankAccount,
} from "@/hooks/useVendorVerification";
import { toast } from "@/hooks/use-toast";
import { VerificationBadge } from "@/components/fraud/VerificationBadge";

interface VerificationPanelProps {
  vendorId: string;
  gstin?: string;
  panNumber?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
}

export function VerificationPanel({
  vendorId,
  gstin,
  panNumber,
  bankAccountNumber,
  bankIfsc,
}: VerificationPanelProps) {
  const { data: verifications, isLoading: verificationsLoading, refetch } = useVendorVerifications(vendorId);
  const verifyPan = useVerifyPan();
  const verifyGst = useVerifyGst();
  const verifyBankAccount = useVerifyBankAccount();

  // Build verification status map
  const verificationStatusMap = verifications?.reduce((acc, v) => {
    acc[v.verification_type] = {
      status: v.status,
      data: v.response_data,
      verified_at: v.verified_at,
    };
    return acc;
  }, {} as Record<string, any>) || {};

  const handleVerifyGst = async () => {
    if (!gstin) {
      toast({ title: "Error", description: "GST number not available", variant: "destructive" });
      return;
    }

    try {
      await verifyGst.mutateAsync({ gstin, vendorId });
      toast({ title: "Success", description: "GST verified successfully" });
      refetch();
    } catch (error) {
      toast({
        title: "Verification Failed",
        description: error instanceof Error ? error.message : "GST verification failed",
        variant: "destructive",
      });
    }
  };

  const handleVerifyPan = async () => {
    if (!panNumber) {
      toast({ title: "Error", description: "PAN number not available", variant: "destructive" });
      return;
    }

    try {
      await verifyPan.mutateAsync({ panNumber, vendorId });
      toast({ title: "Success", description: "PAN verified successfully" });
      refetch();
    } catch (error) {
      toast({
        title: "Verification Failed",
        description: error instanceof Error ? error.message : "PAN verification failed",
        variant: "destructive",
      });
    }
  };

  const handleVerifyBankAccount = async () => {
    if (!bankAccountNumber || !bankIfsc) {
      toast({
        title: "Error",
        description: "Bank account details not available",
        variant: "destructive",
      });
      return;
    }

    try {
      await verifyBankAccount.mutateAsync({
        accountNumber: bankAccountNumber,
        ifscCode: bankIfsc,
        vendorId,
      });
      toast({ title: "Success", description: "Bank account verified successfully" });
      refetch();
    } catch (error) {
      toast({
        title: "Verification Failed",
        description: error instanceof Error ? error.message : "Bank account verification failed",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-warning" />;
      case "in_progress":
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return null;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "success":
        return "bg-success/20 text-success";
      case "failed":
        return "bg-destructive/20 text-destructive";
      case "error":
        return "bg-warning/20 text-warning";
      case "in_progress":
        return "bg-primary/20 text-primary";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (verificationsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Verifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Verification Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PAN Verification */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">PAN Verification</span>
              {verificationStatusMap.pan && getStatusIcon(verificationStatusMap.pan.status)}
            </div>
            {verificationStatusMap.pan && (
              <Badge className={cn("text-xs", getStatusBadgeVariant(verificationStatusMap.pan.status))}>
                {verificationStatusMap.pan.status}
              </Badge>
            )}
          </div>

          {verificationStatusMap.pan?.data && (
            <div className="text-sm text-muted-foreground mb-3 space-y-1">
              <p>Name: <span className="text-foreground font-medium">{verificationStatusMap.pan.data.name}</span></p>
              <p>DOB: <span className="text-foreground font-medium">{verificationStatusMap.pan.data.dob}</span></p>
            </div>
          )}

          <Button
            onClick={handleVerifyPan}
            disabled={!panNumber || verifyPan.isPending}
            variant={verificationStatusMap.pan ? "outline" : "default"}
            size="sm"
            className="w-full"
          >
            {verifyPan.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify PAN"
            )}
          </Button>
        </div>

        {/* GST Verification */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">GST Verification</span>
              {verificationStatusMap.gst && getStatusIcon(verificationStatusMap.gst.status)}
            </div>
            {verificationStatusMap.gst && (
              <Badge className={cn("text-xs", getStatusBadgeVariant(verificationStatusMap.gst.status))}>
                {verificationStatusMap.gst.status}
              </Badge>
            )}
          </div>

          {verificationStatusMap.gst?.data && (
            <div className="text-sm text-muted-foreground mb-3 space-y-1">
              <p>Business: <span className="text-foreground font-medium">{verificationStatusMap.gst.data.business_name}</span></p>
              {verificationStatusMap.gst.data.trade_name && (
                <p>Trade Name: <span className="text-foreground font-medium">{verificationStatusMap.gst.data.trade_name}</span></p>
              )}
              <p>Status: <span className="text-foreground font-medium">{verificationStatusMap.gst.data.status}</span></p>
            </div>
          )}

          <Button
            onClick={handleVerifyGst}
            disabled={!gstin || verifyGst.isPending}
            variant={verificationStatusMap.gst ? "outline" : "default"}
            size="sm"
            className="w-full"
          >
            {verifyGst.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify GST"
            )}
          </Button>
        </div>

        {/* Bank Account Verification */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">Bank Account Verification</span>
              {verificationStatusMap.bank_account && getStatusIcon(verificationStatusMap.bank_account.status)}
            </div>
            {verificationStatusMap.bank_account && (
              <Badge className={cn("text-xs", getStatusBadgeVariant(verificationStatusMap.bank_account.status))}>
                {verificationStatusMap.bank_account.status}
              </Badge>
            )}
          </div>

          {verificationStatusMap.bank_account?.data && (
            <div className="text-sm text-muted-foreground mb-3 space-y-1">
              <p>Account Holder: <span className="text-foreground font-medium">{verificationStatusMap.bank_account.data.account_holder_name}</span></p>
              <p>Bank: <span className="text-foreground font-medium">{verificationStatusMap.bank_account.data.bank_name}</span></p>
              <p>Branch: <span className="text-foreground font-medium">{verificationStatusMap.bank_account.data.branch_name}</span></p>
            </div>
          )}

          {!bankAccountNumber || !bankIfsc ? (
            <p className="text-sm text-muted-foreground italic">
              Bank details not available for this vendor. Please ensure bank account number and IFSC are provided during registration.
            </p>
          ) : (
            <Button
              onClick={handleVerifyBankAccount}
              disabled={verifyBankAccount.isPending}
              variant={verificationStatusMap.bank_account ? "outline" : "default"}
              size="sm"
              className="w-full"
            >
              {verifyBankAccount.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify Bank Account"
              )}
            </Button>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

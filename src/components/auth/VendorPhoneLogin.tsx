import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Phone, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";

export function VendorPhoneLogin() {
  const { tenant } = useTenant();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [testOtp, setTestOtp] = useState("");
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const formatPhoneNumber = (value: string) => {
    return value.replace(/\D/g, "").slice(0, 10);
  };

  const handleSendOTP = async () => {
    if (phone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-public-otp", {
        body: { identifier: phone, identifierType: "phone", tenant_id: tenant?.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSessionId(data.sessionId);
      if (data.isTestMode && data.testOtp) {
        setTestOtp(data.testOtp);
        toast.success(`Test Mode - OTP: ${data.testOtp}`);
      } else {
        toast.success("OTP sent to your WhatsApp");
      }
      setStep("otp");
      setResendCooldown(60);
    } catch (error: any) {
      toast.error(error.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-public-otp", {
        body: { sessionId, otp },
      });

      if (error) throw error;
      if (!data?.verified) {
        throw new Error(data?.error || "Invalid OTP");
      }

      // OTP verified — establish session using the magic link token
      if (data.tokenHash) {
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: data.tokenHash,
          type: "magiclink",
        });

        if (verifyErr) {
          console.error("Session creation failed:", verifyErr.message);
          toast.error("Login failed. Please try again.");
          setLoading(false);
          return;
        }
      }

      await refreshAuth();
      toast.success("Verification successful!");
      navigate("/vendor/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {step === "phone" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-base">
              Mobile Number
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                +91
              </span>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="Enter 10-digit number"
                value={phone}
                onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                className="pl-12 h-14 text-lg"
                maxLength={10}
              />
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          <Button
            onClick={handleSendOTP}
            disabled={phone.length !== 10 || loading}
            className="w-full h-14 text-lg"
            size="lg"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Get OTP via WhatsApp
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="otp" className="text-base">
              Enter OTP
            </Label>
            <p className="text-sm text-muted-foreground">
              Sent to your WhatsApp on +91 {phone}
            </p>
            {testOtp && (
              <p className="text-xs text-muted-foreground bg-muted p-2 rounded">Test mode OTP: <span className="font-mono font-bold">{testOtp}</span></p>
            )}
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-14 text-2xl text-center tracking-[0.5em] font-mono"
              maxLength={6}
            />
          </div>

          <Button
            onClick={handleVerifyOTP}
            disabled={otp.length !== 6 || loading}
            className="w-full h-14 text-lg"
            size="lg"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Verify & Login
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setStep("phone");
                setOtp("");
                setTestOtp("");
              }}
              className="flex-1"
            >
              Change Number
            </Button>
            <Button
              variant="outline"
              onClick={handleSendOTP}
              disabled={resendCooldown > 0 || loading}
              className="flex-1"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

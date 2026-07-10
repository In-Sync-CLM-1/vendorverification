import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Mail, ArrowRight, Loader2, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Channel = "phone" | "email";

export default function VendorPortalLogin() {
  const navigate = useNavigate();
  const { user, userType, refreshAuth } = useAuth();

  const [channel, setChannel] = useState<Channel>("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"identify" | "otp">("identify");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [testOtp, setTestOtp] = useState("");

  useEffect(() => {
    if (user && userType === "vendor") {
      navigate("/vendor/portal/dashboard", { replace: true });
    }
  }, [user, userType, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const identifier = channel === "phone" ? phone : email.trim();

  const canSend =
    channel === "phone" ? phone.length === 10 : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSendOTP = async () => {
    if (!canSend) {
      toast.error(channel === "phone" ? "Enter a valid 10-digit mobile number" : "Enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-public-otp", {
        body: { identifier, identifierType: channel, purpose: "vendor_portal" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSessionId(data.sessionId);
      if (data.isTestMode && data.testOtp) {
        setTestOtp(data.testOtp);
        toast.success(`Test Mode - OTP: ${data.testOtp}`);
      } else {
        toast.success(channel === "phone" ? "OTP sent to your WhatsApp" : "OTP sent to your email");
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
      if (!data?.verified) throw new Error(data?.error || "Invalid OTP");

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
      toast.success("Welcome to your vendor portal!");
      navigate("/vendor/portal/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Vendor Portal</CardTitle>
          <CardDescription>
            Upload invoices and track your payments. Sign in with the email or WhatsApp
            number registered during empanelment — no password needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "identify" ? (
            <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <TabsList className="w-full grid grid-cols-2 mb-6">
                <TabsTrigger value="phone">
                  <Phone className="h-4 w-4 mr-2" /> WhatsApp
                </TabsTrigger>
                <TabsTrigger value="email">
                  <Mail className="h-4 w-4 mr-2" /> Email
                </TabsTrigger>
              </TabsList>

              <TabsContent value="phone" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="vp-phone">Registered mobile number</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                      +91
                    </span>
                    <Input
                      id="vp-phone"
                      type="tel"
                      inputMode="numeric"
                      placeholder="10-digit number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      className="pl-12 h-12"
                      maxLength={10}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="email" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="vp-email">Registered email address</Label>
                  <Input
                    id="vp-email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12"
                  />
                </div>
              </TabsContent>

              <Button onClick={handleSendOTP} disabled={!canSend || loading} className="w-full h-12 mt-6">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Get OTP <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </Tabs>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vp-otp">Enter OTP</Label>
                <p className="text-sm text-muted-foreground">
                  Sent to {channel === "phone" ? `WhatsApp on +91 ${phone}` : email}
                </p>
                {testOtp && (
                  <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                    Test mode OTP: <span className="font-mono font-bold">{testOtp}</span>
                  </p>
                )}
                <Input
                  id="vp-otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-12 text-2xl text-center tracking-[0.5em] font-mono"
                  maxLength={6}
                />
              </div>

              <Button onClick={handleVerifyOTP} disabled={otp.length !== 6 || loading} className="w-full h-12">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Verify & Sign In <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStep("identify");
                    setOtp("");
                    setTestOtp("");
                  }}
                  className="flex-1"
                >
                  Change
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

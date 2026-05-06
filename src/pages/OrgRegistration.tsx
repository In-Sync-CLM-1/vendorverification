import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantLogo } from "@/hooks/useTenantLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, Building2, ArrowLeft, CheckCircle2, Phone, Mail, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function OrgRegistration() {
  const navigate = useNavigate();
  const logo = useTenantLogo();

  const [orgName, setOrgName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Email OTP state
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpValue, setEmailOtpValue] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailSessionId, setEmailSessionId] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);

  // Phone OTP state
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpValue, setPhoneOtpValue] = useState("");
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [phoneCooldown, setPhoneCooldown] = useState(0);
  const [phoneSessionId, setPhoneSessionId] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneTestOtp, setPhoneTestOtp] = useState("");

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const t = setTimeout(() => setEmailCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [emailCooldown]);

  useEffect(() => {
    if (phoneCooldown <= 0) return;
    const t = setTimeout(() => setPhoneCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phoneCooldown]);

  const handleEmailChange = (val: string) => {
    setAdminEmail(val);
    if (emailVerified || emailOtpSent) {
      setEmailVerified(false);
      setEmailOtpSent(false);
      setEmailOtpValue("");
      setEmailSessionId("");
    }
  };

  const handlePhoneChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    setAdminPhone(digits);
    if (phoneVerified || phoneOtpSent) {
      setPhoneVerified(false);
      setPhoneOtpSent(false);
      setPhoneOtpValue("");
      setPhoneSessionId("");
      setPhoneTestOtp("");
    }
  };

  const sendEmailOtp = useCallback(async () => {
    const email = adminEmail.trim();
    setEmailSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-public-otp", {
        body: { identifier: email, identifierType: "email", purpose: "org_registration" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEmailSessionId(data.sessionId);
      setEmailOtpSent(true);
      setEmailCooldown(60);
      toast.success("OTP sent to your email");
    } catch (err: any) {
      toast.error(err.message || "Failed to send OTP");
    } finally {
      setEmailSending(false);
    }
  }, [adminEmail]);

  const verifyEmailOtp = useCallback(async () => {
    if (emailOtpValue.length !== 6) return;
    setEmailVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-public-otp", {
        body: { sessionId: emailSessionId, otp: emailOtpValue },
      });
      if (error) throw error;
      if (data?.verified) {
        setEmailVerified(true);
        toast.success("Email verified!");
      } else {
        toast.error(data?.error || "Invalid OTP");
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setEmailVerifying(false);
    }
  }, [emailOtpValue, emailSessionId]);

  const sendPhoneOtp = useCallback(async () => {
    setPhoneSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-public-otp", {
        body: { identifier: adminPhone, identifierType: "phone", purpose: "org_registration" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPhoneSessionId(data.sessionId);
      setPhoneOtpSent(true);
      setPhoneCooldown(60);
      if (data.isTestMode && data.testOtp) {
        setPhoneTestOtp(data.testOtp);
        toast.success(`Test Mode - OTP: ${data.testOtp}`);
      } else {
        toast.success("OTP sent to your WhatsApp");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send OTP");
    } finally {
      setPhoneSending(false);
    }
  }, [adminPhone]);

  const verifyPhoneOtp = useCallback(async () => {
    if (phoneOtpValue.length !== 6) return;
    setPhoneVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-public-otp", {
        body: { sessionId: phoneSessionId, otp: phoneOtpValue },
      });
      if (error) throw error;
      if (data?.verified) {
        setPhoneVerified(true);
        toast.success("Phone verified!");
      } else {
        toast.error(data?.error || "Invalid OTP");
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setPhoneVerifying(false);
    }
  }, [phoneOtpValue, phoneSessionId]);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim());
  const isValidPhone = adminPhone.length === 10;

  const canSubmit =
    orgName.trim().length >= 2 &&
    adminName.trim().length >= 2 &&
    isValidEmail &&
    isValidPhone &&
    adminPassword.length >= 6 &&
    emailVerified &&
    phoneVerified;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-organization", {
        body: {
          org_name: orgName.trim(),
          admin_name: adminName.trim(),
          admin_email: adminEmail.toLowerCase().trim(),
          admin_password: adminPassword,
          admin_phone: adminPhone,
          email_session_id: emailSessionId,
          phone_session_id: phoneSessionId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: adminEmail.toLowerCase().trim(),
        password: adminPassword,
      });

      if (loginError) {
        toast.info("Organization created successfully. Please log in to continue.", {
          duration: 5000,
        });
        navigate("/staff/login");
        return;
      }

      toast.success("Welcome! Your organization is ready. Redirecting to dashboard...");
      navigate("/staff/dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/30 to-background flex flex-col">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/">
              <img src={logo} alt="Vendor Verification Portal" className="h-10 w-auto" />
            </a>
          </div>
          <Button variant="ghost" onClick={() => navigate("/staff/login")}>
            Already have an account? Login
          </Button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">Register Your Organization</CardTitle>
            <CardDescription>
              Set up your vendor verification portal. First 3 verifications free.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  placeholder="e.g., Acme Industries"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminName">Your Full Name</Label>
                <Input
                  id="adminName"
                  placeholder="e.g., Rajesh Kumar"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  maxLength={100}
                />
              </div>

              {/* Work Email + OTP */}
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Work Email</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="you@company.com"
                  value={adminEmail}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  disabled={emailVerified}
                />
                {emailVerified ? (
                  <div className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Email verified
                  </div>
                ) : !emailOtpSent ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={sendEmailOtp}
                    disabled={emailSending || !isValidEmail}
                  >
                    {emailSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                    Send OTP via Email
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-sm">Enter 6-digit OTP</Label>
                    <InputOTP maxLength={6} value={emailOtpValue} onChange={setEmailOtpValue}>
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
                      </InputOTPGroup>
                    </InputOTP>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={verifyEmailOtp} disabled={emailVerifying || emailOtpValue.length !== 6}>
                        {emailVerifying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Verify
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={sendEmailOtp} disabled={emailCooldown > 0 || emailSending}>
                        {emailCooldown > 0 ? `Resend (${emailCooldown}s)` : "Resend OTP"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Number + OTP */}
              <div className="space-y-2">
                <Label htmlFor="adminPhone">Mobile Number</Label>
                <div className="flex gap-2">
                  <div className="flex items-center px-3 h-10 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground shrink-0">
                    +91
                  </div>
                  <Input
                    id="adminPhone"
                    type="tel"
                    placeholder="10-digit number"
                    value={adminPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    maxLength={10}
                    disabled={phoneVerified}
                    className="flex-1"
                  />
                </div>
                {phoneVerified ? (
                  <div className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Phone verified
                  </div>
                ) : !phoneOtpSent ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={sendPhoneOtp}
                    disabled={phoneSending || !isValidPhone}
                  >
                    {phoneSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
                    Send OTP via WhatsApp
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-sm">Enter 6-digit OTP</Label>
                    {phoneTestOtp && (
                      <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                        Test mode OTP: <span className="font-mono font-bold">{phoneTestOtp}</span>
                      </p>
                    )}
                    <InputOTP maxLength={6} value={phoneOtpValue} onChange={setPhoneOtpValue}>
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
                      </InputOTPGroup>
                    </InputOTP>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={verifyPhoneOtp} disabled={phoneVerifying || phoneOtpValue.length !== 6}>
                        {phoneVerifying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Verify
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={sendPhoneOtp} disabled={phoneCooldown > 0 || phoneSending}>
                        {phoneCooldown > 0 ? `Resend (${phoneCooldown}s)` : "Resend OTP"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminPassword">Password</Label>
                <div className="relative">
                  <Input
                    id="adminPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 6 characters"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating your organization...
                  </>
                ) : (
                  "Create Organization"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => navigate("/")}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to home
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

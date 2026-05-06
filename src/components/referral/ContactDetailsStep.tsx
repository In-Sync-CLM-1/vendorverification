import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Phone, Mail, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useTenant } from "@/contexts/TenantContext";

interface ContactDetailsStepProps {
  formData: {
    salutation: string;
    primary_contact_name: string;
    primary_mobile: string;
    primary_email: string;
  };
  phoneVerified: boolean;
  emailVerified: boolean;
  onChange: (field: string, value: string) => void;
  onPhoneVerified: () => void;
  onEmailVerified: () => void;
}

export function ContactDetailsStep({ formData, phoneVerified, emailVerified, onChange, onPhoneVerified, onEmailVerified }: ContactDetailsStepProps) {
  const { tenant } = useTenant();
  // Phone OTP state
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpValue, setPhoneOtpValue] = useState("");
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [phoneCooldown, setPhoneCooldown] = useState(0);
  const [phoneSessionId, setPhoneSessionId] = useState("");
  const [phoneTestOtp, setPhoneTestOtp] = useState("");

  // Email OTP state
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpValue, setEmailOtpValue] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailSessionId, setEmailSessionId] = useState("");

  // Cooldown timers
  useEffect(() => {
    if (phoneCooldown <= 0) return;
    const t = setTimeout(() => setPhoneCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phoneCooldown]);

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const t = setTimeout(() => setEmailCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [emailCooldown]);

  // Send Phone OTP
  const sendPhoneOtp = useCallback(async () => {
    const phone = formData.primary_mobile.replace(/\D/g, "");
    if (phone.length !== 10) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setPhoneSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-public-otp", {
        body: { identifier: phone, identifierType: "phone", tenant_id: tenant?.id },
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
  }, [formData.primary_mobile]);

  // Verify Phone OTP
  const verifyPhoneOtp = useCallback(async () => {
    if (phoneOtpValue.length !== 6) return;
    setPhoneVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-public-otp", {
        body: { sessionId: phoneSessionId, otp: phoneOtpValue },
      });
      if (error) throw error;
      if (data?.verified) {
        onPhoneVerified();
        toast.success("Phone verified!");
      } else {
        toast.error(data?.error || "Invalid OTP");
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setPhoneVerifying(false);
    }
  }, [phoneOtpValue, phoneSessionId, onPhoneVerified]);

  // Send Email OTP
  const sendEmailOtp = useCallback(async () => {
    const email = formData.primary_email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setEmailSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-public-otp", {
        body: { identifier: email, identifierType: "email", tenant_id: tenant?.id },
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
  }, [formData.primary_email]);

  // Verify Email OTP
  const verifyEmailOtp = useCallback(async () => {
    if (emailOtpValue.length !== 6) return;
    setEmailVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-public-otp", {
        body: { sessionId: emailSessionId, otp: emailOtpValue },
      });
      if (error) throw error;
      if (data?.verified) {
        onEmailVerified();
        toast.success("Email verified!");
      } else {
        toast.error(data?.error || "Invalid OTP");
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setEmailVerifying(false);
    }
  }, [emailOtpValue, emailSessionId, onEmailVerified]);

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center gap-3">
        <User className="h-8 w-8 text-primary" />
        <h2 className="text-2xl font-semibold text-foreground">Contact Details</h2>
      </div>

      <div className="space-y-5">
        {/* Salutation */}
        <div>
          <Label className="text-base font-semibold">Salutation</Label>
          <Select value={formData.salutation} onValueChange={(val) => onChange("salutation", val)}>
            <SelectTrigger className="h-14 mt-2 text-base">
              <SelectValue placeholder="Select salutation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Mr">Mr</SelectItem>
              <SelectItem value="Mrs">Mrs</SelectItem>
              <SelectItem value="Ms">Ms</SelectItem>
              <SelectItem value="Dr">Dr</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Contact Name */}
        <div>
          <Label htmlFor="primary_contact_name" className="text-base font-semibold">Contact Person Name *</Label>
          <Input
            id="primary_contact_name"
            value={formData.primary_contact_name}
            onChange={(e) => onChange("primary_contact_name", e.target.value)}
            placeholder="Full name"
            className="h-14 mt-2 text-base"
          />
        </div>

        {/* Mobile Number + Phone OTP */}
        <div>
          <Label htmlFor="primary_mobile" className="text-base font-semibold">Mobile Number *</Label>
          <div className="flex gap-2 mt-2">
            <div className="flex items-center px-3 h-14 rounded-md border border-input bg-muted/50 text-base text-muted-foreground">
              +91
            </div>
            <Input
              id="primary_mobile"
              type="tel"
              value={formData.primary_mobile}
              onChange={(e) => onChange("primary_mobile", e.target.value.replace(/\D/g, ""))}
              placeholder="10-digit number"
              className="h-14 flex-1 text-base"
              maxLength={10}
              disabled={phoneVerified}
            />
          </div>

          {phoneVerified ? (
            <div className="flex items-center gap-1.5 mt-2 text-base text-accent">
              <CheckCircle2 className="h-5 w-5" />
              Phone verified
            </div>
          ) : !phoneOtpSent ? (
            <Button
              type="button"
              variant="outline"
              className="mt-2 h-12 text-base"
              onClick={sendPhoneOtp}
              disabled={phoneSending || formData.primary_mobile.replace(/\D/g, "").length !== 10}
            >
              {phoneSending ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : <Phone className="h-5 w-5 mr-1" />}
              Send OTP via WhatsApp
            </Button>
          ) : (
            <div className="mt-3 space-y-3">
              <Label className="text-base">Enter 6-digit OTP</Label>
              {phoneTestOtp && (
                <p className="text-sm text-muted-foreground bg-muted p-2 rounded">Test mode OTP: <span className="font-mono font-bold">{phoneTestOtp}</span></p>
              )}
              <InputOTP maxLength={6} value={phoneOtpValue} onChange={setPhoneOtpValue}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <div className="flex items-center gap-2">
                <Button type="button" className="h-12 text-base" onClick={verifyPhoneOtp} disabled={phoneVerifying || phoneOtpValue.length !== 6}>
                  {phoneVerifying ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : null}
                  Verify
                </Button>
                <Button type="button" variant="ghost" className="h-12 text-base" onClick={sendPhoneOtp} disabled={phoneCooldown > 0 || phoneSending}>
                  {phoneCooldown > 0 ? `Resend (${phoneCooldown}s)` : "Resend OTP"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Email + Email OTP */}
        <div>
          <Label htmlFor="primary_email" className="text-base font-semibold">Email Address *</Label>
          <div className="flex items-center gap-2 mt-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <Input
              id="primary_email"
              type="email"
              value={formData.primary_email}
              onChange={(e) => onChange("primary_email", e.target.value)}
              placeholder="email@company.com"
              className="h-14 flex-1 text-base"
              disabled={emailVerified}
            />
          </div>

          {emailVerified ? (
            <div className="flex items-center gap-1.5 mt-2 text-base text-accent">
              <CheckCircle2 className="h-5 w-5" />
              Email verified
            </div>
          ) : !emailOtpSent ? (
            <Button
              type="button"
              variant="outline"
              className="mt-2 h-12 text-base"
              onClick={sendEmailOtp}
              disabled={emailSending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.primary_email.trim())}
            >
              {emailSending ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : <Mail className="h-5 w-5 mr-1" />}
              Send OTP via Email
            </Button>
          ) : (
            <div className="mt-3 space-y-3">
              <Label className="text-base">Enter 6-digit Email OTP</Label>
              <InputOTP maxLength={6} value={emailOtpValue} onChange={setEmailOtpValue}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <div className="flex items-center gap-2">
                <Button type="button" className="h-12 text-base" onClick={verifyEmailOtp} disabled={emailVerifying || emailOtpValue.length !== 6}>
                  {emailVerifying ? <Loader2 className="h-5 w-5 animate-spin mr-1" /> : null}
                  Verify
                </Button>
                <Button type="button" variant="ghost" className="h-12 text-base" onClick={sendEmailOtp} disabled={emailCooldown > 0 || emailSending}>
                  {emailCooldown > 0 ? `Resend (${emailCooldown}s)` : "Resend OTP"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

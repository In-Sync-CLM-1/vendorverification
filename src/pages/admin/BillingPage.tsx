import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  CheckCircle2,
  IndianRupee,
  Sparkles,
  ArrowRight,
  CreditCard,
  Receipt,
  Shield,
  Zap,
  Tag,
} from "lucide-react";
import { UrlTabs } from "@/components/UrlTabs";

declare global {
  interface Window {
    Razorpay: any;
  }
}

type Plan = {
  id: string;
  name: string;
  description: string;
  vendor_limit: number;
  monthly_price: number;
};

type Subscription = {
  id: string;
  plan: string;
  status: string;
  vendor_limit: number;
  vendors_used: number;
  monthly_price: number;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
};

type Transaction = {
  id: string;
  type: string;
  category: string;
  amount: number;
  description: string;
  reference_id: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  trial: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  past_due: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  expired: "bg-gray-100 text-gray-800",
};

const PLAN_FEATURES = [
  "6-in-1 government API verification",
  "AI document analysis",
  "Fraud detection",
  "Review & approve workflow",
  "DPDP compliance built-in",
  "PDF report downloads",
];

export default function BillingPage() {
  const { user } = useAuth();
  const { isAdmin } = useUserRoles();
  const queryClient = useQueryClient();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paying, setPaying] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponValid, setCouponValid] = useState<{ valid: boolean; discount_percent?: number } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const callBilling = async (action: string, params: any = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const { data, error } = await supabase.functions.invoke("billing", {
      body: { action, ...params },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (error) throw new Error(error.message);
    return data;
  };

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => callBilling("get_subscription"),
    enabled: !!user,
  });

  const { data: plansData } = useQuery({
    queryKey: ["plans"],
    queryFn: () => callBilling("get_plans"),
    enabled: !!user,
  });

  const { data: txnData, isLoading: txnLoading } = useQuery({
    queryKey: ["billing-transactions"],
    queryFn: () => callBilling("get_transactions", { page: 1 }),
    enabled: !!user,
  });

  const subscription: Subscription | null = subData?.subscription;
  const plans: Plan[] = plansData?.plans || [];
  const transactions: Transaction[] = txnData?.transactions || [];

  const loadRazorpay = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) { resolve(true); return; }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    try {
      const result = await callBilling("validate_coupon", { code: couponCode.trim() });
      setCouponValid(result);
      if (result.valid) {
        toast.success(`Coupon applied! ${result.discount_percent}% discount`);
      } else {
        toast.error(result.error || "Invalid coupon");
      }
    } catch {
      setCouponValid(null);
      toast.error("Failed to validate coupon");
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleUpgrade = async (plan: Plan) => {
    if (!isAdmin) {
      toast.error("Only admins can manage billing");
      return;
    }

    setPaying(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) { toast.error("Failed to load payment gateway"); return; }

      const appliedCoupon = couponValid?.valid ? couponCode.trim() : undefined;
      const data = await callBilling("create_order", {
        plan_id: plan.id,
        coupon_code: appliedCoupon,
      });

      const options = {
        key: data.razorpay_key_id,
        amount: data.order.amount,
        currency: data.order.currency,
        order_id: data.order.id,
        name: "In-Sync",
        description: `${plan.name} Plan - Monthly Subscription${data.discount ? ` (${data.discount_percent}% off)` : ""}`,
        handler: async (response: any) => {
          try {
            await callBilling("verify_payment", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan_id: plan.id,
              coupon_id: data.coupon_id,
            });
            toast.success(`Upgraded to ${plan.name} plan!`);
            queryClient.invalidateQueries({ queryKey: ["subscription"] });
            queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
            setUpgradeOpen(false);
            setCouponCode("");
            setCouponValid(null);
          } catch (err: any) {
            toast.error(err.message || "Payment verification failed");
          }
        },
        prefill: { email: user?.email },
        theme: { color: "#0066B3" },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate payment");
    } finally {
      setPaying(false);
    }
  };

  if (subLoading) {
    return (
      <StaffLayout title="Billing">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StaffLayout>
    );
  }

  const usagePercent = subscription
    ? Math.min(100, Math.round((subscription.vendors_used / subscription.vendor_limit) * 100))
    : 0;

  const paidPlans = plans.filter((p) => p.monthly_price > 0);

  return (
    <StaffLayout title="Billing & Subscription">
      <div className="flex-1 overflow-auto">
        <UrlTabs param="billingpage_tab" defaultValue="overview" className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start px-4 h-auto py-2 bg-card border-b rounded-none">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="transactions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              Transactions
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="flex-1 p-4 md:p-6 space-y-6 mt-0">
            {/* Current Plan Card */}
            <Card className="border-2 border-primary/20">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-xl font-bold text-foreground">
                        {subscription?.plan === "free_trial" ? "Free Trial" :
                         subscription?.plan === "starter" ? "Starter" :
                         subscription?.plan === "professional" ? "Professional" :
                         subscription?.plan === "enterprise" ? "Enterprise" : "No Plan"}
                      </h2>
                      <Badge className={STATUS_COLORS[subscription?.status || "trial"]}>
                        {subscription?.status === "trial" ? "Trial" :
                         subscription?.status === "active" ? "Active" :
                         subscription?.status || "Unknown"}
                      </Badge>
                    </div>
                    {subscription?.billing_cycle_end && (
                      <p className="text-sm text-muted-foreground">
                        Renews on {format(new Date(subscription.billing_cycle_end), "dd MMM yyyy")}
                      </p>
                    )}
                    {subscription?.plan === "free_trial" && (
                      <p className="text-sm text-muted-foreground">
                        {subscription.vendor_limit - subscription.vendors_used} free verifications remaining
                      </p>
                    )}
                  </div>
                  <Button onClick={() => setUpgradeOpen(true)} disabled={!isAdmin}>
                    {subscription?.plan === "free_trial" ? "Upgrade Plan" : "Change Plan"}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>

                {/* Usage bar */}
                <div className="mt-6">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">
                      Vendors verified this period
                    </span>
                    <span className="font-semibold">
                      {subscription?.vendors_used || 0} / {subscription?.vendor_limit || 5}
                    </span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        usagePercent >= 90 ? "bg-destructive" :
                        usagePercent >= 70 ? "bg-warning" : "bg-primary"
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Plan comparison (for free trial users) */}
            {subscription?.plan === "free_trial" && paidPlans.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-accent" />
                  <h3 className="text-lg font-bold text-foreground">Upgrade to continue verifying</h3>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {paidPlans.map((plan) => (
                    <Card
                      key={plan.id}
                      className={`cursor-pointer hover:shadow-lg transition-all ${
                        plan.id === "professional" ? "border-2 border-primary ring-1 ring-primary/20" : ""
                      }`}
                      onClick={() => { setSelectedPlan(plan); setUpgradeOpen(true); }}
                    >
                      <CardContent className="p-6 text-center">
                        {plan.id === "professional" && (
                          <Badge className="bg-primary text-primary-foreground mb-3">Most Popular</Badge>
                        )}
                        <h4 className="text-lg font-semibold">{plan.name}</h4>
                        <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                        <div className="flex items-center justify-center mb-2">
                          <IndianRupee className="h-5 w-5" />
                          <span className="text-3xl font-bold">{plan.monthly_price.toLocaleString("en-IN")}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">/month + GST</p>
                        <p className="text-sm font-medium text-primary mb-4">
                          {plan.vendor_limit === 999999 ? "Unlimited" : `Up to ${plan.vendor_limit}`} vendors/month
                        </p>
                        <Button className="w-full" variant={plan.id === "professional" ? "default" : "outline"}>
                          Select Plan
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* What's included */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Included in all plans
                </h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {PLAN_FEATURES.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                      <span className="text-muted-foreground">{f}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="flex-1 p-4 md:p-6 mt-0">
            <div className="space-y-2">
              {txnLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Receipt className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No transactions yet</p>
                </div>
              ) : (
                transactions.map((txn) => (
                  <Card key={txn.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{txn.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(txn.created_at), "dd MMM yyyy, hh:mm a")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${txn.type === "credit" ? "text-green-600" : "text-foreground"}`}>
                          {txn.type === "credit" ? "+" : "-"} <IndianRupee className="h-3 w-3 inline" />
                          {txn.amount.toLocaleString("en-IN")}
                        </p>
                        <Badge variant="outline" className="text-xs capitalize">
                          {txn.category.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </UrlTabs>
      </div>

      {/* Upgrade Dialog */}
      <Dialog open={upgradeOpen} onOpenChange={(open) => {
        setUpgradeOpen(open);
        if (!open) { setCouponCode(""); setCouponValid(null); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose a Plan</DialogTitle>
          </DialogHeader>

          {/* Coupon input */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                <Tag className="h-3 w-3 inline mr-1" />
                Coupon Code
              </label>
              <Input
                placeholder="e.g. HAPPY50"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setCouponValid(null);
                }}
                className="h-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={handleApplyCoupon}
              disabled={!couponCode.trim() || validatingCoupon}
            >
              {validatingCoupon ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
            </Button>
          </div>
          {couponValid?.valid && (
            <p className="text-xs text-green-600 font-medium -mt-1">
              <CheckCircle2 className="h-3 w-3 inline mr-1" />
              {couponValid.discount_percent}% discount applied!
            </p>
          )}

          <div className="space-y-3">
            {paidPlans.map((plan) => {
              const isSelected = selectedPlan?.id === plan.id;
              const discountPct = couponValid?.valid ? couponValid.discount_percent || 0 : 0;
              const discount = Math.round(plan.monthly_price * discountPct / 100);
              const discountedPrice = plan.monthly_price - discount;
              const gst = Math.round(discountedPrice * 0.18);
              const total = discountedPrice + gst;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{plan.name}</p>
                      <p className="text-xs text-muted-foreground">{plan.description}</p>
                    </div>
                    <div className="text-right">
                      {discount > 0 ? (
                        <>
                          <p className="text-xs text-muted-foreground line-through">
                            <IndianRupee className="h-2.5 w-2.5 inline" />
                            {plan.monthly_price.toLocaleString("en-IN")}
                          </p>
                          <p className="font-bold flex items-center text-green-600">
                            <IndianRupee className="h-3.5 w-3.5" />
                            {discountedPrice.toLocaleString("en-IN")}
                          </p>
                        </>
                      ) : (
                        <p className="font-bold flex items-center">
                          <IndianRupee className="h-3.5 w-3.5" />
                          {plan.monthly_price.toLocaleString("en-IN")}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        + <IndianRupee className="h-2.5 w-2.5 inline" />{gst.toLocaleString("en-IN")} GST = <IndianRupee className="h-2.5 w-2.5 inline" />{total.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedPlan && handleUpgrade(selectedPlan)}
              disabled={!selectedPlan || paying}
            >
              {paying ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              {paying ? "Processing..." : "Pay & Upgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StaffLayout>
  );
}

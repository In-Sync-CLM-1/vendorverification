import { useState, useEffect } from "react";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useAuth } from "@/hooks/useAuth";
import { useReferralCode } from "@/hooks/useReferralCode";
import { ReferralLinkCard } from "@/components/staff/ReferralLinkCard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Send,
  Loader2,
  Mail,
  Building2,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Link2,
  ChevronDown,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { z } from "zod";

const inviteSchema = z.object({
  company_name: z.string().trim().min(1, "Company name is required").max(200),
  contact_email: z.string().trim().email("Invalid email address").max(255),
  contact_phone: z.string().trim().min(10, "Phone number must be at least 10 digits").max(15),
  category_id: z.string().uuid("Please select a category"),
});

type InvitationStatus = "pending" | "used" | "expired";

function getInvitationStatus(invitation: { used_at: string | null; expires_at: string }): InvitationStatus {
  if (invitation.used_at) return "used";
  if (new Date(invitation.expires_at) < new Date()) return "expired";
  return "pending";
}

const STATUS_CONFIG: Record<InvitationStatus, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Pending", className: "bg-warning/20 text-warning", icon: Clock },
  used: { label: "Registered", className: "bg-success/20 text-success", icon: CheckCircle2 },
  expired: { label: "Expired", className: "bg-destructive/20 text-destructive", icon: XCircle },
};

export default function StaffInviteVendor() {
  const { user } = useAuth();
  const { referralCode, isLoading: referralLoading } = useReferralCode();

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [sending, setSending] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("send");
  const [statusFilter, setStatusFilter] = useState<InvitationStatus | "all">("all");

  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    loadCategories();
    if (user) loadInvitations();
  }, [user]);

  const loadCategories = async () => {
    const { data } = await supabase
      .from("vendor_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    if (data) setCategories(data);
  };

  const loadInvitations = async () => {
    if (!user) return;
    setLoadingInvitations(true);
    const { data } = await supabase
      .from("vendor_invitations")
      .select("id, company_name, contact_email, contact_phone, token, created_at, expires_at, used_at, category_id, vendor_categories(name)")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });
    if (data) setInvitations(data);
    setLoadingInvitations(false);
  };

  const handleSendInvitation = async () => {
    const result = inviteSchema.safeParse({
      company_name: companyName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      category_id: categoryId,
    });

    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await supabase.functions.invoke("send-vendor-invitation", {
        body: result.data,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (response.error) throw new Error(response.error.message);

      toast.success("Invitation sent successfully!");
      setCompanyName("");
      setContactEmail("");
      setContactPhone("");
      setCategoryId("");
      loadInvitations();
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setSending(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const pendingCount = invitations.filter(i => getInvitationStatus(i) === "pending").length;
  const usedCount = invitations.filter(i => getInvitationStatus(i) === "used").length;

  const handleDeleteInvitation = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("vendor_invitations").delete().eq("id", id);
      if (error) throw error;
      setInvitations(prev => prev.filter(i => i.id !== id));
      toast.success("Invitation deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete invitation");
    } finally {
      setDeletingId(null);
    }
  };

  const handleResendInvitation = async (inv: any) => {
    setResendingId(inv.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const response = await supabase.functions.invoke("send-vendor-invitation", {
        body: {
          company_name: inv.company_name,
          contact_email: inv.contact_email,
          contact_phone: inv.contact_phone,
          category_id: inv.category_id,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.error) throw new Error(response.error.message);
      toast.success("Invitation resent successfully!");
      loadInvitations();
    } catch (err: any) {
      toast.error(err.message || "Failed to resend invitation");
    } finally {
      setResendingId(null);
    }
  };

  const handleStatClick = (filter: InvitationStatus | "all") => {
    setStatusFilter(filter);
    setActiveTab("sent");
  };

  const filteredInvitations = statusFilter === "all"
    ? invitations
    : invitations.filter(i => getInvitationStatus(i) === statusFilter);

  return (
    <StaffLayout title="Invite a Vendor">
      <div className="flex-1 flex flex-col">
        {/* Compact Referral Link - Collapsible */}
        <Collapsible open={referralOpen} onOpenChange={setReferralOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-4 py-3 border-b bg-secondary/30 hover:bg-secondary/50 transition-colors text-sm">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Link2 className="h-4 w-4 text-primary" />
                My Referral Link
                {referralCode && (
                  <Badge variant="outline" className="font-mono text-xs ml-1">
                    {referralCode}
                  </Badge>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${referralOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 border-b bg-card">
              <ReferralLinkCard referralCode={referralCode || ""} isLoading={referralLoading} />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === "send") setStatusFilter("all"); }} className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start px-4 h-auto py-2 bg-card border-b rounded-none">
            <TabsTrigger
              value="send"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Send Invite
            </TabsTrigger>
            <TabsTrigger
              value="sent"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Sent
              {invitations.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-muted">
                  {invitations.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Send Invitation Tab */}
          <TabsContent value="send" className="flex-1 p-3 sm:p-4 mt-0">
            <Card>
              <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="company_name">Company Name</Label>
                    <Input
                      id="company_name"
                      placeholder="Enter company name"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="contact_email">Email Address</Label>
                    <Input
                      id="contact_email"
                      type="email"
                      placeholder="vendor@company.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="contact_phone">Phone Number</Label>
                    <Input
                      id="contact_phone"
                      placeholder="+91 9876543210"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Label htmlFor="category">Vendor Category</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  className="w-full mt-4"
                  onClick={handleSendInvitation}
                  disabled={sending}
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5 mr-2" />
                  )}
                  {sending ? "Sending..." : "Send Invitation"}
                </Button>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            {invitations.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/30"
                  onClick={() => handleStatClick("all")}
                >
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-bold">{invitations.length}</p>
                    <p className="text-xs text-muted-foreground">Total Sent</p>
                  </CardContent>
                </Card>
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-warning/30"
                  onClick={() => handleStatClick("pending")}
                >
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-bold text-warning">{pendingCount}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </CardContent>
                </Card>
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-success/30"
                  onClick={() => handleStatClick("used")}
                >
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-bold text-success">{usedCount}</p>
                    <p className="text-xs text-muted-foreground">Registered</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="sent" className="flex-1 p-4 mt-0">
            {/* Filter indicator */}
            {statusFilter !== "all" && (
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-xs">
                  Showing: {statusFilter === "pending" ? "Pending" : "Registered"}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setStatusFilter("all")}
                >
                  Clear filter
                </Button>
              </div>
            )}
            {loadingInvitations ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredInvitations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mail className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {statusFilter !== "all" ? `No ${statusFilter} invitations` : "No invitations sent yet"}
                </p>
                {statusFilter === "all" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the "Send Invite" tab to invite vendors
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredInvitations.map((inv) => {
                  const status = getInvitationStatus(inv);
                  const config = STATUS_CONFIG[status];
                  const StatusIcon = config.icon;
                  return (
                    <Card key={inv.id} className="overflow-hidden">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm truncate">{inv.company_name}</p>
                              <Badge className={`text-xs shrink-0 ${config.className}`}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {config.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{inv.contact_email}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {inv.vendor_categories?.name || "—"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            {referralCode && (
                              <div className="flex items-center gap-1.5 mt-1.5 p-1.5 rounded bg-muted/50">
                                <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                <p className="text-[11px] text-muted-foreground truncate font-mono">
                                  {`https://vendorverification.in-sync.co.in/register/ref/${referralCode}`}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[10px] shrink-0"
                                  onClick={() => {
                                    navigator.clipboard.writeText(`https://vendorverification.in-sync.co.in/register/ref/${referralCode}`);
                                    toast.success("Link copied!");
                                  }}
                                >
                                  Copy
                                </Button>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              {status !== "used" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={resendingId === inv.id}
                                  onClick={() => handleResendInvitation(inv)}
                                >
                                  {resendingId === inv.id ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3 w-3 mr-1" />
                                  )}
                                  Resend
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={deletingId === inv.id}
                                onClick={() => handleDeleteInvitation(inv.id)}
                              >
                                {deletingId === inv.id ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3 mr-1" />
                                )}
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </StaffLayout>
  );
}
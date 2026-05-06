import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useAuth } from "@/hooks/useAuth";
import { useReferralCode } from "@/hooks/useReferralCode";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Pencil,
  Ban,
  RotateCcw,
  UserPlus,
  Send,
  Loader2,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  Link2,
  Mail,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { z } from "zod";

const inviteSchema = z.object({
  company_name: z.string().trim().min(1, "Company name is required").max(200),
  contact_email: z.string().trim().email("Invalid email address").max(255),
  contact_phone: z.string().trim().min(10, "Phone number must be at least 10 digits").max(15),
  category_id: z.string().uuid("Please select a category"),
});

type VendorRow = {
  id: string;
  vendor_code: string | null;
  company_name: string;
  primary_contact_name: string;
  primary_email: string;
  primary_mobile: string;
  approved_at: string | null;
  current_status: string;
};

type InvitationStatus = "pending" | "used" | "expired";

function getInvitationStatus(invitation: { used_at: string | null; expires_at: string }): InvitationStatus {
  if (invitation.used_at) return "used";
  if (new Date(invitation.expires_at) < new Date()) return "expired";
  return "pending";
}

const INV_STATUS_CONFIG: Record<InvitationStatus, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Pending", className: "bg-warning/20 text-warning", icon: Clock },
  used: { label: "Registered", className: "bg-success/20 text-success", icon: CheckCircle2 },
  expired: { label: "Expired", className: "bg-destructive/20 text-destructive", icon: XCircle },
};

export default function VendorList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { referralCode, isLoading: referralLoading } = useReferralCode();

  const [search, setSearch] = useState("");
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [confirmVendor, setConfirmVendor] = useState<VendorRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<"deactivate" | "reactivate">("deactivate");
  const [activeTab, setActiveTab] = useState("vendors");

  // Invite form state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Load vendors
  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendor-list", showDeactivated],
    queryFn: async () => {
      const statuses = showDeactivated
        ? ["approved", "rejected", "deactivated"]
        : ["approved", "rejected"];
      const { data, error } = await supabase
        .from("vendors")
        .select("id, vendor_code, company_name, primary_contact_name, primary_email, primary_mobile, approved_at, current_status")
        .in("current_status", statuses as any)
        .order("approved_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as VendorRow[];
    },
  });

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

  const statusMutation = useMutation({
    mutationFn: async ({ vendorId, newStatus }: { vendorId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("vendors")
        .update({ current_status: newStatus as any })
        .eq("id", vendorId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      const action = variables.newStatus === "deactivated" ? "deactivated" : "reactivated";
      toast({ title: `Vendor ${action} successfully` });
      queryClient.invalidateQueries({ queryKey: ["vendor-list"] });
      setConfirmVendor(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = vendors.filter(
    (v) =>
      v.company_name.toLowerCase().includes(search.toLowerCase()) ||
      (v.vendor_code || "").toLowerCase().includes(search.toLowerCase()) ||
      v.primary_contact_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleStatusChange = (vendor: VendorRow, action: "deactivate" | "reactivate") => {
    setConfirmVendor(vendor);
    setConfirmAction(action);
  };

  const executeStatusChange = () => {
    if (!confirmVendor) return;
    const newStatus = confirmAction === "deactivate" ? "deactivated" : "approved";
    statusMutation.mutate({ vendorId: confirmVendor.id, newStatus });
  };

  const handleSendInvitation = async () => {
    const result = inviteSchema.safeParse({
      company_name: companyName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      category_id: categoryId,
    });
    if (!result.success) {
      sonnerToast.error(result.error.errors[0].message);
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
      sonnerToast.success("Invitation sent successfully!");
      setCompanyName("");
      setContactEmail("");
      setContactPhone("");
      setCategoryId("");
      setInviteOpen(false);
      loadInvitations();
    } catch (err: any) {
      sonnerToast.error(err.message || "Failed to send invitation");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteInvitation = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("vendor_invitations").delete().eq("id", id);
      if (error) throw error;
      setInvitations((prev) => prev.filter((i) => i.id !== id));
      sonnerToast.success("Invitation deleted");
    } catch (err: any) {
      sonnerToast.error(err.message || "Failed to delete invitation");
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
      sonnerToast.success("Invitation resent!");
      loadInvitations();
    } catch (err: any) {
      sonnerToast.error(err.message || "Failed to resend invitation");
    } finally {
      setResendingId(null);
    }
  };

  const approvedCount = vendors.filter((v) => v.current_status === "approved").length;
  const rejectedCount = vendors.filter((v) => v.current_status === "rejected").length;

  return (
    <StaffLayout title="Vendor List">
      <div className="flex-1 flex flex-col">
        {/* Top bar: search + invite */}
        <div className="p-4 border-b bg-card flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="show-deactivated"
                checked={showDeactivated}
                onCheckedChange={setShowDeactivated}
              />
              <Label htmlFor="show-deactivated" className="text-sm text-muted-foreground">
                Deactivated
              </Label>
            </div>
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Vendor
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm max-h-[85vh] overflow-y-auto p-4 gap-3">
                <DialogHeader className="space-y-0">
                  <DialogTitle className="text-base">Invite a Vendor</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="inv-company" className="text-xs">Company Name</Label>
                    <Input
                      id="inv-company"
                      placeholder="Enter company name"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="inv-email" className="text-xs">Email</Label>
                      <Input
                        id="inv-email"
                        type="email"
                        placeholder="vendor@company.com"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label htmlFor="inv-phone" className="text-xs">Phone</Label>
                      <Input
                        id="inv-phone"
                        placeholder="+91 9876543210"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="inv-category" className="text-xs">Category</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger className="mt-1 h-9">
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
                  <Button className="w-full h-9" onClick={handleSendInvitation} disabled={sending}>
                    {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    {sending ? "Sending..." : "Send Invitation"}
                  </Button>
                  {referralCode && !referralLoading && (
                    <div className="pt-2 border-t flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Link2 className="h-3 w-3" />
                        Referral: <span className="font-mono">{referralCode}</span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(`https://vendorverification.in-sync.co.in/register/ref/${referralCode}`);
                          sonnerToast.success("Link copied!");
                        }}
                      >
                        Copy Link
                      </Button>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start px-4 h-auto py-2 bg-card border-b rounded-none">
            <TabsTrigger value="vendors" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Vendors
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-muted">{filtered.length}</span>
            </TabsTrigger>
            <TabsTrigger value="invitations" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Invitations
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-muted">{invitations.length}</span>
            </TabsTrigger>
          </TabsList>

          {/* Vendors Tab */}
          <TabsContent value="vendors" className="flex-1 mt-0 overflow-auto">
            <div className="flex items-center gap-4 px-4 py-2 text-sm text-muted-foreground border-b">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> {approvedCount} approved
              </span>
              <span className="flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-destructive" /> {rejectedCount} rejected
              </span>
            </div>
            <div className="rounded-md bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor Code</TableHead>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Contact Person</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="hidden lg:table-cell">Mobile</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No vendors found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((vendor) => (
                      <TableRow key={vendor.id} className={vendor.current_status === "deactivated" ? "opacity-60" : ""}>
                        <TableCell className="font-mono text-xs">{vendor.vendor_code || "-"}</TableCell>
                        <TableCell className="font-medium">{vendor.company_name}</TableCell>
                        <TableCell>{vendor.primary_contact_name}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{vendor.primary_email}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{vendor.primary_mobile}</TableCell>
                        <TableCell className="text-sm">
                          {vendor.approved_at ? format(new Date(vendor.approved_at), "dd MMM yyyy") : "-"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge
                            className={
                              vendor.current_status === "approved"
                                ? "bg-green-100 text-green-800 hover:bg-green-100"
                                : vendor.current_status === "rejected"
                                ? "bg-red-100 text-red-800 hover:bg-red-100"
                                : "bg-gray-100 text-gray-800 hover:bg-gray-100"
                            }
                          >
                            {vendor.current_status === "approved" ? "Active" : vendor.current_status === "rejected" ? "Rejected" : "Deactivated"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/staff/vendor/${vendor.id}`)} title="View">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {vendor.current_status === "approved" && (
                              <Button variant="ghost" size="icon" onClick={() => handleStatusChange(vendor, "deactivate")} title="Deactivate" className="text-destructive hover:text-destructive">
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                            {vendor.current_status === "deactivated" && (
                              <Button variant="ghost" size="icon" onClick={() => handleStatusChange(vendor, "reactivate")} title="Reactivate" className="text-green-600 hover:text-green-700">
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Invitations Tab */}
          <TabsContent value="invitations" className="flex-1 p-4 mt-0 overflow-auto">
            {loadingInvitations ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : invitations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mail className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No invitations sent yet</p>
                <p className="text-xs text-muted-foreground mt-1">Click "Invite Vendor" to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {invitations.map((inv) => {
                  const status = getInvitationStatus(inv);
                  const config = INV_STATUS_CONFIG[status];
                  const StatusIcon = config.icon;
                  return (
                    <Card key={inv.id}>
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
                              <Badge variant="outline" className="text-xs">{inv.vendor_categories?.name || "-"}</Badge>
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
                                    sonnerToast.success("Link copied!");
                                  }}
                                >
                                  Copy
                                </Button>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              {status !== "used" && (
                                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={resendingId === inv.id} onClick={() => handleResendInvitation(inv)}>
                                  {resendingId === inv.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                                  Resend
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deletingId === inv.id} onClick={() => handleDeleteInvitation(inv.id)}>
                                {deletingId === inv.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
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

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmVendor} onOpenChange={(open) => !open && setConfirmVendor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "deactivate" ? "Deactivate" : "Reactivate"} Vendor
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {confirmAction}{" "}
              <strong>{confirmVendor?.company_name}</strong>
              {confirmAction === "deactivate"
                ? "? They will no longer be active in the system."
                : "? They will be restored to active status."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeStatusChange}
              className={confirmAction === "deactivate" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {confirmAction === "deactivate" ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StaffLayout>
  );
}

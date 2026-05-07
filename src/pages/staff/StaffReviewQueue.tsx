import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useStaffVendorQueue, VendorWithCategory } from "@/hooks/useStaffWorkflow";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Building2,
  Clock,
  ChevronRight,
  Loader2,
  AlertTriangle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  pending_approval: "Pending Approval",
  returned_to_maker: "Returned by Approver",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-warning/20 text-warning",
  pending_approval: "bg-accent/20 text-accent",
  returned_to_maker: "bg-orange-100 text-orange-700",
  approved: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
};

export default function StaffReviewQueue() {
  const navigate = useNavigate();
  const { isAdmin, isMaker, isApprover, isLoading: rolesLoading } = useUserRoles();
  const isReviewer = isMaker;
  const { data: vendors, isLoading: vendorsLoading } = useStaffVendorQueue();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("pending_review");

  if (rolesLoading) {
    return (
      <StaffLayout title="Approval Queue">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StaffLayout>
    );
  }

  const getFilteredVendors = (status: string) => {
    return vendors?.filter(v => {
      const matchesStatus = v.current_status === status;
      const matchesSearch = search === "" ||
        v.company_name.toLowerCase().includes(search.toLowerCase()) ||
        v.vendor_code?.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    }) || [];
  };

  const pendingReviewVendors = getFilteredVendors("pending_review");
  const pendingApprovalVendors = getFilteredVendors("pending_approval");
  const returnedVendors = getFilteredVendors("returned_to_maker");

  const renderVendorCard = (vendor: VendorWithCategory) => {
    // Check for fraud flags (contextual fraud alert)
    const hasFraudFlag = vendor.vendor_code && vendors?.some(
      v => v.id !== vendor.id && (
        (v.gst_number && v.gst_number === (vendor as any).gst_number) ||
        (v.pan_number && v.pan_number === (vendor as any).pan_number)
      )
    );

    return (
      <Card
        key={vendor.id}
        className={`cursor-pointer hover:shadow-md transition-shadow ${hasFraudFlag ? 'border-destructive/50' : ''}`}
        onClick={() => navigate(`/staff/vendor/${vendor.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold truncate">{vendor.company_name}</p>
                {hasFraudFlag && (
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">{vendor.vendor_code || 'No code'}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {vendor.vendor_categories?.name}
                </Badge>
                <Badge className={`text-xs ${STATUS_COLORS[vendor.current_status]}`}>
                  {STATUS_LABELS[vendor.current_status]}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                {formatDistanceToNow(new Date(vendor.updated_at), { addSuffix: true })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const tabs = [
    { value: "pending_review", label: "Review", count: pendingReviewVendors.length, show: isReviewer || isAdmin },
    { value: "pending_approval", label: "Approve", count: pendingApprovalVendors.length, show: isApprover || isAdmin },
    { value: "returned_to_maker", label: "Returned by Approver", count: returnedVendors.length, show: isReviewer || isAdmin },
  ].filter(tab => tab.show);

  return (
    <StaffLayout title="Approval Queue">
      <div className="flex-1 flex flex-col">
        {/* Search */}
        <div className="p-4 border-b bg-card">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start px-4 h-auto py-2 bg-card border-b rounded-none overflow-x-auto">
            {tabs.map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="relative data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-muted">
                    {tab.count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {vendorsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <TabsContent value="pending_review" className="flex-1 p-4 space-y-3 overflow-auto mt-0">
                {pendingReviewVendors.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No vendors pending review</p>
                ) : pendingReviewVendors.map(renderVendorCard)}
              </TabsContent>
              <TabsContent value="pending_approval" className="flex-1 p-4 space-y-3 overflow-auto mt-0">
                {pendingApprovalVendors.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No vendors pending approval</p>
                ) : pendingApprovalVendors.map(renderVendorCard)}
              </TabsContent>
              <TabsContent value="returned_to_maker" className="flex-1 p-4 space-y-3 overflow-auto mt-0">
                {returnedVendors.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nothing returned by the approver</p>
                ) : returnedVendors.map(renderVendorCard)}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </StaffLayout>
  );
}

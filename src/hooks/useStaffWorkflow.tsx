import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserRoles } from "./useUserRoles";
import { toast } from "sonner";
import { Vendor, VendorDocument } from "./useVendor";

export interface VendorWithCategory extends Vendor {
  vendor_categories: {
    name: string;
  };
}

export function useStaffVendorQueue() {
  const { user } = useAuth();
  const { isAdmin, isMaker, isApprover } = useUserRoles();

  return useQuery({
    queryKey: ["staff-vendor-queue", user?.id, isAdmin, isMaker, isApprover],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("vendors")
        .select(`
          *,
          vendor_categories (name)
        `)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data as VendorWithCategory[];
    },
    enabled: !!user,
  });
}

export function useVendorDetails(vendorId: string | null) {
  return useQuery({
    queryKey: ["vendor-details", vendorId],
    queryFn: async () => {
      if (!vendorId) return null;

      // Use RPC for decrypted PII fields
      const { data: decryptedVendor, error: rpcError } = await supabase
        .rpc("get_vendor_decrypted", { p_vendor_id: vendorId });

      if (rpcError) throw rpcError;

      // Also get category name
      const { data: categoryData } = await supabase
        .from("vendor_categories")
        .select("name")
        .eq("id", (decryptedVendor as any)?.category_id)
        .single();

      return {
        ...(decryptedVendor as unknown as Vendor),
        vendor_categories: categoryData || { name: "Unknown" },
      } as VendorWithCategory;
    },
    enabled: !!vendorId,
  });
}

export function useVendorDocumentsForReview(vendorId: string | null) {
  return useQuery({
    queryKey: ["vendor-documents-review", vendorId],
    queryFn: async () => {
      if (!vendorId) return [];

      const { data, error } = await supabase
        .from("vendor_documents")
        .select(`
          *,
          document_types (name, has_expiry)
        `)
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as (VendorDocument & { document_types: { name: string; has_expiry: boolean } })[];
    },
    enabled: !!vendorId,
  });
}

export function useUpdateVendorStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      vendorId,
      newStatus,
      comments,
    }: {
      vendorId: string;
      newStatus: Vendor["current_status"];
      comments?: string;
    }) => {
      // Get current status and tenant_id
      const { data: vendor, error: fetchError } = await supabase
        .from("vendors")
        .select("current_status, tenant_id")
        .eq("id", vendorId)
        .single();

      if (fetchError) throw fetchError;

      // Update vendor status
      const updateData: Record<string, any> = { current_status: newStatus };
      if (newStatus === "approved") {
        updateData.approved_at = new Date().toISOString();
      } else if (newStatus === "rejected") {
        updateData.rejected_at = new Date().toISOString();
        updateData.rejection_reason = comments || null;
      } else if ((newStatus as string) === "sent_back") {
        updateData.sent_back_reason = comments || null;
      }

      const { error: updateError } = await supabase
        .from("vendors")
        .update(updateData)
        .eq("id", vendorId);

      if (updateError) throw updateError;

      // Add workflow history
      const { error: historyError } = await supabase
        .from("workflow_history")
        .insert({
          vendor_id: vendorId,
          tenant_id: vendor.tenant_id,
          from_status: vendor.current_status,
          to_status: newStatus,
          action: newStatus === "rejected" ? "rejected" : (newStatus as string) === "sent_back" ? "returned" : newStatus === "approved" ? "approved" : "forwarded",
          action_by: user!.id,
          comments: comments || null,
        });

      if (historyError) throw historyError;

      // Phase 5: Create notification for the vendor
      let notificationTitle = "";
      let notificationMessage = "";

      if (newStatus === "approved") {
        notificationTitle = "Vendor Approved";
        notificationMessage = `Your vendor registration has been approved. Welcome!`;
      } else if (newStatus === "rejected") {
        notificationTitle = "Vendor Registration Rejected";
        notificationMessage = `Your vendor registration was rejected. Reason: ${comments || "Not specified"}`;
      } else if ((newStatus as string) === "sent_back") {
        notificationTitle = "Corrections Required";
        notificationMessage = `Your application was sent back for corrections. Reason: ${comments || "Please review and resubmit"}`;
      }

      if (notificationTitle) {
        const { data: vendorUser } = await supabase
          .from("vendor_users")
          .select("user_id")
          .eq("vendor_id", vendorId)
          .eq("is_primary_contact", true)
          .maybeSingle();

        if (vendorUser?.user_id) {
          const notificationType = newStatus === "approved" ? "approval" : newStatus === "rejected" ? "rejection" : "sent_back";

          await supabase.from("notifications").insert({
            recipient_id: vendorUser.user_id,
            tenant_id: vendor.tenant_id,
            title: notificationTitle,
            message: notificationMessage,
            notification_type: notificationType,
            related_vendor_id: vendorId,
          });

          // Send email notification
          supabase.functions.invoke("send-notification-email", {
            body: {
              recipient_id: vendorUser.user_id,
              title: notificationTitle,
              message: notificationMessage,
              notification_type: notificationType,
            },
          }).catch(() => {
            // Email failure is non-blocking
          });
        }
      }

      // Fire webhook for all status changes (fire-and-forget)
      const webhookEventMap: Record<string, string> = {
        pending_review: "vendor.submitted",
        pending_approval: "vendor.reviewed",
        approved: "vendor.approved",
        rejected: "vendor.rejected",
        sent_back: "vendor.sent_back",
      };
      const webhookEvent = webhookEventMap[newStatus as string];
      if (webhookEvent && vendor.tenant_id) {
        supabase.functions.invoke("send-webhook", {
          body: {
            tenant_id: vendor.tenant_id,
            event: webhookEvent,
            vendor_id: vendorId,
            payload: { status: newStatus, comments: comments || null },
          },
        }).catch(() => {
          // Webhook failure is non-blocking
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-vendor-queue"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-details"] });
      toast.success("Vendor status updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update status");
    },
  });
}

export function useUpdateDocumentStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      documentId,
      status,
      comments,
    }: {
      documentId: string;
      status: VendorDocument["status"];
      comments?: string;
    }) => {
      const { error } = await supabase
        .from("vendor_documents")
        .update({
          status,
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_comments: comments || null,
        })
        .eq("id", documentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-documents-review"] });
      toast.success("Document status updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update document");
    },
  });
}

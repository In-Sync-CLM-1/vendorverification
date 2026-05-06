import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface Vendor {
  id: string;
  vendor_code: string | null;
  category_id: string;
  company_name: string;
  trade_name: string | null;
  gst_number: string | null;
  pan_number: string | null;
  cin_number: string | null;
  registered_address: string | null;
  operational_address: string | null;
  primary_contact_name: string;
  primary_mobile: string;
  primary_email: string;
  secondary_contact_name: string | null;
  secondary_mobile: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  current_status: "draft" | "pending_review" | "pending_approval" | "approved" | "rejected";
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorDocument {
  id: string;
  vendor_id: string;
  document_type_id: string;
  file_url: string;
  file_name: string;
  file_size_bytes: number | null;
  version_number: number;
  expiry_date: string | null;
  status: "uploaded" | "under_review" | "approved" | "rejected" | "expired";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comments: string | null;
  created_at: string;
  document_types?: {
    name: string;
  };
}

export function useVendorProfile() {
  const { user, userType } = useAuth();

  return useQuery({
    queryKey: ["vendor-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;

      // First get vendor_user record
      const { data: vendorUser, error: vuError } = await supabase
        .from("vendor_users")
        .select("vendor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (vuError) throw vuError;
      if (!vendorUser) return null;

      // Use RPC to get decrypted vendor details
      const { data: vendor, error } = await supabase
        .rpc("get_vendor_decrypted", { p_vendor_id: vendorUser.vendor_id });

      if (error) throw error;
      return vendor as unknown as Vendor;
    },
    enabled: !!user && userType === "vendor",
  });
}

export function useVendorDocuments(vendorId: string | null) {
  return useQuery({
    queryKey: ["vendor-documents", vendorId],
    queryFn: async () => {
      if (!vendorId) return [];

      const { data, error } = await supabase
        .from("vendor_documents")
        .select("*, document_types(name)")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as VendorDocument[];
    },
    enabled: !!vendorId,
  });
}

export function useUpdateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ vendorId, data }: { vendorId: string; data: Partial<Vendor> }) => {
      const { error } = await supabase
        .from("vendors")
        .update(data)
        .eq("id", vendorId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-profile"] });
      toast.success("Information saved");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save");
    },
  });
}

export function useSubmitVendorApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vendorId: string) => {
      const { error } = await supabase
        .from("vendors")
        .update({ 
          current_status: "pending_review",
          submitted_at: new Date().toISOString()
        })
        .eq("id", vendorId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-profile"] });
      toast.success("Application submitted for review!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit");
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      vendorId,
      documentTypeId,
      file,
      expiryDate,
    }: {
      vendorId: string;
      documentTypeId: string;
      file: File;
      expiryDate?: string;
    }) => {
      // Upload file to storage
      const fileName = `${vendorId}/${documentTypeId}/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from("vendor-documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("vendor-documents")
        .getPublicUrl(fileName);

      // Check if document already exists for this type
      const { data: existingDoc } = await supabase
        .from("vendor_documents")
        .select("id, version_number")
        .eq("vendor_id", vendorId)
        .eq("document_type_id", documentTypeId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get vendor's tenant_id
      const { data: vendorRecord } = await supabase
        .from("vendors")
        .select("tenant_id")
        .eq("id", vendorId)
        .maybeSingle();

      // Create document record
      const { error: dbError } = await supabase
        .from("vendor_documents")
        .insert({
          vendor_id: vendorId,
          tenant_id: vendorRecord?.tenant_id,
          document_type_id: documentTypeId,
          file_url: urlData.publicUrl,
          file_name: file.name,
          file_size_bytes: file.size,
          version_number: existingDoc ? existingDoc.version_number + 1 : 1,
          expiry_date: expiryDate || null,
          status: "uploaded",
        });

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-documents"] });
      toast.success("Document uploaded successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload document");
    },
  });
}

// Type definitions shared between staff hooks. The vendor-side hooks that
// previously lived here were removed when the vendor self-service portal
// was retired — vendors now interact only through the public referral
// registration flow.

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
  current_status: "draft" | "pending_review" | "pending_approval" | "approved" | "rejected" | "returned_to_maker";
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

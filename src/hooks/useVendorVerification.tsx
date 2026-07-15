import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

async function safeParseJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error("Failed to parse response:", text);
    throw new Error("Verification service is temporarily unavailable. Please try again.");
  }
}

export function useVendorVerifications(vendorId: string) {
  return useQuery({
    queryKey: ["vendor-verifications", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_verifications")
        .select("*")
        .eq("vendor_id", vendorId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!vendorId,
  });
}

export function useVerifyPan() {
  return useMutation({
    mutationFn: async ({ panNumber, vendorId }: { panNumber: string; vendorId: string }) => {
      const response = await fetch(`${FUNCTIONS_BASE}/verify-pan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pan_number: panNumber.toUpperCase(), vendor_id: vendorId }),
      });

      const data = await safeParseJson(response);
      if (!data.success) throw new Error(data.error || "PAN verification failed");
      return data.data;
    },
  });
}

export function useVerifyGst() {
  return useMutation({
    mutationFn: async ({ gstin, vendorId }: { gstin: string; vendorId: string }) => {
      const response = await fetch(`${FUNCTIONS_BASE}/verify-gst`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstin: gstin.toUpperCase(), vendor_id: vendorId }),
      });

      const data = await safeParseJson(response);
      if (!data.success) throw new Error(data.error || "GST verification failed");
      return data.data;
    },
  });
}

export function useVerifyBankAccount() {
  return useMutation({
    mutationFn: async ({
      accountNumber,
      ifscCode,
      vendorId,
    }: {
      accountNumber: string;
      ifscCode: string;
      vendorId: string;
    }) => {
      const response = await fetch(`${FUNCTIONS_BASE}/verify-bank-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_number: accountNumber, ifsc_code: ifscCode, vendor_id: vendorId }),
      });

      const data = await safeParseJson(response);
      if (!data.success) throw new Error(data.error || "Bank account verification failed");
      return data.data;
    },
  });
}


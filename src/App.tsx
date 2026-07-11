import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TenantProvider } from "@/contexts/TenantContext";
import { AuthProvider } from "@/hooks/useAuth";

// Pages
import LandingPage from "./pages/LandingPage";
import OrgRegistration from "./pages/OrgRegistration";
import NotFound from "./pages/NotFound";

// Vendor Pages (referral registration only — no self-registration)
import VendorReferralRegistration from "./pages/vendor/VendorReferralRegistration";
import VendorVerifyAadhaar from "./pages/vendor/VendorVerifyAadhaar";
import PrivacyPolicy from "./pages/vendor/PrivacyPolicy";
import VendorPortalLogin from "./pages/vendor/VendorPortalLogin";
import VendorPortalDashboard from "./pages/vendor/VendorPortalDashboard";
import WalkthroughPage from "./pages/WalkthroughPage";
import HowItWorksPage from "./pages/HowItWorksPage";

// Staff Pages
import StaffLogin from "./pages/staff/StaffLogin";
import StaffDashboard from "./pages/staff/StaffDashboard";
import StaffReviewQueue from "./pages/staff/StaffReviewQueue";
import VendorReviewDetail from "./pages/staff/VendorReviewDetail";
import StaffProfile from "./pages/staff/StaffProfile";
import VendorList from "./pages/staff/VendorList";
import BulkImportVendors from "./pages/staff/BulkImportVendors";
import BulkInviteVendors from "./pages/staff/BulkInviteVendors";
import FraudAlertsDashboard from "./pages/staff/FraudAlertsDashboard";
import StaffInvoices from "./pages/staff/StaffInvoices";
const StaffInvoiceAnalytics = lazy(() => import("./pages/staff/StaffInvoiceAnalytics"));

// Admin Pages
import AdminUserManagement from "./pages/admin/AdminUserManagement";
import AdminSettings from "./pages/admin/AdminSettings";
import DpdpAuditDashboard from "./pages/admin/DpdpAuditDashboard";
import BillingPage from "./pages/admin/BillingPage";

// Platform-admin Pages
import PlatformDashboard from "./pages/platform/PlatformDashboard";

const queryClient = new QueryClient();

const App = () => (
  <TenantProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/register" element={<OrgRegistration />} />
            <Route path="/register/ref/:token" element={<VendorReferralRegistration />} />
            <Route path="/vendor/verify-aadhaar/:verificationId" element={<VendorVerifyAadhaar />} />
            <Route path="/vendor/portal" element={<VendorPortalLogin />} />
            <Route path="/vendor/portal/dashboard" element={<VendorPortalDashboard />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/walkthrough" element={<WalkthroughPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />

            {/* Staff Routes */}
            <Route path="/staff/login" element={<StaffLogin />} />
            <Route path="/staff/dashboard" element={<StaffDashboard />} />
            <Route path="/staff/queue" element={<StaffReviewQueue />} />
            <Route path="/staff/vendor/:vendorId" element={<VendorReviewDetail />} />
            <Route path="/staff/profile" element={<StaffProfile />} />
            <Route path="/staff/vendors" element={<VendorList />} />
            <Route path="/staff/fraud-alerts" element={<FraudAlertsDashboard />} />
            <Route path="/staff/invoices" element={<StaffInvoices />} />
            <Route
              path="/staff/invoice-analytics"
              element={
                <Suspense fallback={<div className="min-h-screen" />}>
                  <StaffInvoiceAnalytics />
                </Suspense>
              }
            />
            <Route path="/staff/bulk-import" element={<BulkImportVendors />} />
            <Route path="/staff/bulk-invite" element={<BulkInviteVendors />} />

            {/* Admin Routes */}
            <Route path="/admin/users" element={<AdminUserManagement />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/dpdp-audit" element={<DpdpAuditDashboard />} />
            <Route path="/admin/billing" element={<BillingPage />} />

            {/* Platform-admin Routes */}
            <Route path="/platform/dashboard" element={<PlatformDashboard />} />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </TenantProvider>
);

export default App;

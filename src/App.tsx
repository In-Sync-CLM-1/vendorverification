import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TenantProvider } from "@/contexts/TenantContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

// Pages
import LandingPage from "./pages/LandingPage";
import OrgRegistration from "./pages/OrgRegistration";
import NotFound from "./pages/NotFound";

// Vendor Pages (referral registration only — no self-registration)
import VendorReferralRegistration from "./pages/vendor/VendorReferralRegistration";
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
import StaffPaymentMatching from "./pages/staff/StaffPaymentMatching";
import StaffDetailChangeRequests from "./pages/staff/StaffDetailChangeRequests";
import StaffAdvanceRequests from "./pages/staff/StaffAdvanceRequests";
import ProjectOwnerApprovals from "./pages/staff/ProjectOwnerApprovals";
import VendorSensitiveInfo from "./pages/staff/VendorSensitiveInfo";
import LivecomInvoiceUpload from "./pages/staff/LivecomInvoiceUpload";

// Admin Pages
import AdminUserManagement from "./pages/admin/AdminUserManagement";
import AdminSettings from "./pages/admin/AdminSettings";
import DpdpAuditDashboard from "./pages/admin/DpdpAuditDashboard";
import BillingPage from "./pages/admin/BillingPage";

// Platform-admin Pages
import PlatformDashboard from "./pages/platform/PlatformDashboard";

const queryClient = new QueryClient();

// The landing page is a public marketing page with no auth check of its own,
// so a visitor arriving with an already-valid session (e.g. the RMPL OPM
// SSO handoff, or just a returning user with a live session) saw the
// marketing page instead of their dashboard. Redirect once session state
// (and account type) has resolved.
function RootRoute() {
  const { session, userType, loading } = useAuth();
  if (loading) return null;
  if (session && userType === "staff") return <Navigate to="/staff/dashboard" replace />;
  if (session && userType === "vendor") return <Navigate to="/vendor/portal/dashboard" replace />;
  return <LandingPage />;
}

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
            <Route path="/" element={<RootRoute />} />
            <Route path="/register" element={<OrgRegistration />} />
            <Route path="/register/ref/:token" element={<VendorReferralRegistration />} />
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
            <Route path="/staff/payment-matching" element={<StaffPaymentMatching />} />
            <Route path="/staff/change-requests" element={<StaffDetailChangeRequests />} />
            <Route path="/staff/advance-requests" element={<StaffAdvanceRequests />} />
            <Route path="/staff/pi-approvals" element={<ProjectOwnerApprovals />} />
            <Route path="/staff/sensitive-info" element={<VendorSensitiveInfo />} />
            <Route path="/staff/livecom-upload" element={<LivecomInvoiceUpload />} />
            {/* Invoice Analytics was merged into the one Dashboard */}
            <Route path="/staff/invoice-analytics" element={<Navigate to="/staff/dashboard" replace />} />
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

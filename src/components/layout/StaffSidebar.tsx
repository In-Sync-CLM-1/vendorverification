import { useNavigate, useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  ClipboardList,
  ShieldCheck,
  ShieldAlert,
  Users,
  List,
  Settings,
  Send,
  LogOut,
  UserCircle,
  CreditCard,
  Upload,
  Building2,
  ReceiptIndianRupee,
  ChartColumnBig,
  Landmark,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantLogo } from "@/hooks/useTenantLogo";

const EMAIL_NAME_MAP: Record<string, string> = {
  "a@in-sync.co.in": "Amit Sengupta",
};

const navSections = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/staff/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Vendor Onboarding",
    items: [
      { title: "Approval Queue", url: "/staff/queue", icon: ClipboardList },
      { title: "Vendor List", url: "/staff/vendors", icon: List },
      { title: "Fraud Alerts", url: "/staff/fraud-alerts", icon: ShieldAlert },
      { title: "Bulk Import", url: "/staff/bulk-import", icon: Upload },
      { title: "Bulk Invite", url: "/staff/bulk-invite", icon: Send },
    ],
  },
  {
    label: "Invoices & Payments",
    items: [
      { title: "Invoices", url: "/staff/invoices", icon: ReceiptIndianRupee },
      { title: "Match Payments", url: "/staff/payment-matching", icon: Landmark },
      { title: "Invoice Analytics", url: "/staff/invoice-analytics", icon: ChartColumnBig },
    ],
  },
];

const adminItems = [
  { title: "User Management", url: "/admin/users", icon: Users },
  { title: "Billing", url: "/admin/billing", icon: CreditCard },
  { title: "System Settings", url: "/admin/settings", icon: Settings },
  { title: "DPDP Audit", url: "/admin/dpdp-audit", icon: ShieldCheck },
];

export function StaffSidebar() {
  const { signOut, user } = useAuth();
  const { isAdmin, isPlatformAdmin } = useUserRoles();
  const { tenant } = useTenant();
  const logo = useTenantLogo();
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const { data: profile } = useQuery({
    queryKey: ["sidebar-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, department")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon">
      {/* Logo & User Identity Header */}
      <div className="flex flex-col items-center gap-2 px-2 py-5 border-b border-border/50">
        <a href="/" className="bg-white rounded-xl p-2 shadow-sm shrink-0 block">
          <img
            src={logo}
            alt={tenant?.short_name || "Vendor Verification Portal"}
            className="w-[120px] rounded-lg object-contain"
          />
        </a>
        {!collapsed && (
          <div className="text-center mt-1">
            <p className="text-sm font-semibold text-white truncate max-w-[160px]">
              {EMAIL_NAME_MAP[user?.email || ""] || profile?.full_name || "Staff User"}
            </p>
            {profile?.department && (
              <p className="text-xs text-white/70 truncate max-w-[160px]">
                {profile.department}
              </p>
            )}
          </div>
        )}
      </div>

      <SidebarContent>
        {isPlatformAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Command Center"
                    isActive={location.pathname === "/platform/dashboard"}
                  >
                    <NavLink
                      to="/platform/dashboard"
                      className="hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <Building2 className="h-4 w-4" />
                      <span>Command Center</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            {navSections.map((section) => (
              <SidebarGroup key={section.label}>
                <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild tooltip={item.title} isActive={location.pathname === item.url}>
                          <NavLink
                            to={item.url}
                            className="hover:bg-muted/50"
                            activeClassName="bg-primary/10 text-primary font-medium"
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}

            {isAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel>Administration</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {adminItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild tooltip={item.title} isActive={location.pathname === item.url}>
                          <NavLink
                            to={item.url}
                            className="hover:bg-muted/50"
                            activeClassName="bg-primary/10 text-primary font-medium"
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="space-y-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="My Profile" isActive={location.pathname === "/staff/profile"}>
              <NavLink
                to="/staff/profile"
                className="hover:bg-muted/50"
                activeClassName="bg-primary/10 text-primary font-medium"
              >
                <UserCircle className="h-4 w-4" />
                <span>My Profile</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sign Out" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

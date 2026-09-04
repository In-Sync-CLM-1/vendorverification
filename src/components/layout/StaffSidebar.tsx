import { useLayoutEffect, useRef } from "react";
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
  Landmark,
  UserCog,
  Lock,
  HandCoins,
  ClipboardCheck,
  FileUp,
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
import { OrgSwitcher } from "./OrgSwitcher";

const EMAIL_NAME_MAP: Record<string, string> = {
  "a@in-sync.co.in": "Amit Sengupta",
};

// Every staff page wraps itself in its own <StaffLayout>, so this sidebar
// remounts fresh on every navigation. Without this, the menu's scroll
// position snapped back to the top on every click instead of staying where
// the user left it.
let savedScrollTop = 0;

// Items that are pure write actions with no view-only equivalent — a
// view-only account (see useUserRoles().isViewOnly) never sees these, since
// RLS would refuse the underlying action anyway.
const WRITE_ONLY_ITEMS = new Set([
  "Match Payments",
  "Bulk Invite",
  "Bulk Import",
  "Sensitive Info",
]);

const navSections = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/staff/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Vendor Payments",
    items: [
      { title: "PI / Quotation Approvals", url: "/staff/pi-approvals", icon: ClipboardCheck },
      { title: "Advance Requests", url: "/staff/advance-requests", icon: HandCoins },
      { title: "Invoices", url: "/staff/invoices", icon: ReceiptIndianRupee },
      { title: "Match Payments", url: "/staff/payment-matching", icon: Landmark },
    ],
  },
  {
    label: "Invite Vendors",
    items: [{ title: "Bulk Invite", url: "/staff/bulk-invite", icon: Send }],
  },
  {
    label: "Vendor Onboarding",
    items: [
      { title: "Approval Queue", url: "/staff/queue", icon: ClipboardList },
      { title: "Vendor List", url: "/staff/vendors", icon: List },
      { title: "Fraud Alerts", url: "/staff/fraud-alerts", icon: ShieldAlert },
      { title: "Bulk Import", url: "/staff/bulk-import", icon: Upload },
      { title: "Detail Change Requests", url: "/staff/change-requests", icon: UserCog },
      { title: "Sensitive Info", url: "/staff/sensitive-info", icon: Lock },
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
  const { isAdmin, isPlatformAdmin, isViewOnly, isLivecomUploader } = useUserRoles();
  const { tenant } = useTenant();
  const logo = useTenantLogo();
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = savedScrollTop;
  }, []);

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
            alt={tenant?.short_name || "Vendor-Sync"}
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

      <SidebarContent ref={scrollRef} onScroll={(e) => { savedScrollTop = e.currentTarget.scrollTop; }}>
        {!collapsed && <OrgSwitcher />}
        {/* A platform admin belongs to a tenant like anyone else, so they get
            the normal staff navigation as well as the console — not instead
            of it. */}
        {isPlatformAdmin && (
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
        )}
        {/* Independent of isViewOnly filtering below — a Livecom account can
            be view-only for everything else and still get this one screen. */}
        {isLivecomUploader && (
          <SidebarGroup>
            <SidebarGroupLabel>Livecom</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Upload Invoice for Vendor"
                    isActive={location.pathname === "/staff/livecom-upload"}
                  >
                    <NavLink
                      to="/staff/livecom-upload"
                      className="hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <FileUp className="h-4 w-4" />
                      <span>Upload Invoice for Vendor</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {(
          <>
            {navSections.map((section) => {
              const items = isViewOnly
                ? section.items.filter((item) => !WRITE_ONLY_ITEMS.has(item.title))
                : section.items;
              if (items.length === 0) return null;
              return (
              <SidebarGroup key={section.label}>
                <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => (
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
              );
            })}

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

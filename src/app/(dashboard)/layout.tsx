"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  FileText,
  Send,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Key,
  ShieldCheck,
  Receipt,
  FlaskConical,
  QrCode,
  Smartphone,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Profile, Organization } from "@/types/database";

type NavItem =
  | { type: "link"; href: string; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }
  | { type: "separator"; label: string };

const navItems: NavItem[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { type: "separator", label: "WhatsApp Web" },
  { type: "link", href: "/dashboard/wa-sessions", label: "WA Sessions", icon: QrCode },
  { type: "link", href: "/dashboard/wa-send", label: "WA Send", icon: Smartphone },
  { type: "separator", label: "Official API" },
  { type: "link", href: "/dashboard/templates", label: "Templates", icon: FileText },
  { type: "link", href: "/dashboard/campaigns", label: "Campaigns", icon: Send },
  { type: "link", href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { type: "link", href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { type: "link", href: "/dashboard/api-keys", label: "API Keys", icon: Key },
  { type: "link", href: "/dashboard/api-tester", label: "API Tester", icon: FlaskConical },
  { type: "link", href: "/docs", label: "API Docs", icon: BookOpen },
  { type: "separator", label: "Settings" },
  { type: "link", href: "/dashboard/billing", label: "Billing", icon: Receipt },
  { type: "link", href: "/dashboard/settings", label: "Settings", icon: Settings },
  { type: "link", href: "/dashboard/admin", label: "Admin", icon: ShieldCheck, adminOnly: true },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Load profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (profileData) setProfile(profileData);

      // Load organization
      const { data: memberData } = await supabase
        .from("org_members")
        .select("org_id, role")
        .eq("user_id", user.id)
        .single();
      if (memberData?.role === "owner") setIsOwner(true);

      if (memberData) {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", memberData.org_id)
          .single();
        if (orgData) setOrg(orgData);
      }
      setAuthLoading(false);
    }
    loadData();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <MessageSquare className="h-10 w-10 text-green-600 animate-pulse" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar toggle */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-green-600" />
          <span className="font-bold">WA Connect Pro</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r transform transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-6 py-5 border-b">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-7 w-7 text-green-600" />
              <span className="text-xl font-bold">WA Connect Pro</span>
            </div>
            {org && (
              <p className="text-xs text-gray-500 mt-1 truncate">{org.name}</p>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems
              .filter((item) => {
                if (item.type === "link" && item.adminOnly && !isOwner) return false;
                return true;
              })
              .map((item, index) => {
                if (item.type === "separator") {
                  return (
                    <div key={item.label} className="pt-4 pb-1 px-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        {item.label}
                      </p>
                    </div>
                  );
                }
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-green-50 text-green-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
          </nav>

          {/* Remove unused credits display — billing page handles this */}

          {/* User */}
          <div className="border-t px-3 py-3 space-y-2">
            <div className="flex items-center gap-3 px-3 py-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-green-100 text-green-700 text-sm">
                  {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {profile?.full_name || "User"}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {profile?.email}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="lg:pl-64 pt-14 lg:pt-0">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

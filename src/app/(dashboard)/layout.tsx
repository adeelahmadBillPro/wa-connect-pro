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
  Key,
  ShieldCheck,
  Receipt,
  FlaskConical,
  QrCode,
  Smartphone,
  BookOpen,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { Profile, Organization } from "@/types/database";

type NavItem =
  | { type: "link"; href: string; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }
  | { type: "separator"; label: string; adminOnly?: boolean };

const navItems: NavItem[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { type: "separator", label: "WhatsApp" },
  { type: "link", href: "/dashboard/wa-sessions", label: "Sessions", icon: QrCode },
  { type: "link", href: "/dashboard/wa-send", label: "Send Messages", icon: Smartphone },
  { type: "link", href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { type: "separator", label: "Account" },
  { type: "link", href: "/dashboard/billing", label: "Billing", icon: Receipt, adminOnly: true },
  { type: "link", href: "/dashboard/settings", label: "Settings", icon: Settings },
  { type: "separator", label: "Developer" },
  { type: "link", href: "/dashboard/api-keys", label: "API Keys", icon: Key },
  { type: "link", href: "/docs", label: "API Docs", icon: BookOpen },
  { type: "separator", label: "Admin", adminOnly: true },
  { type: "link", href: "/dashboard/templates", label: "Templates", icon: FileText, adminOnly: true },
  { type: "link", href: "/dashboard/campaigns", label: "Campaigns", icon: Send, adminOnly: true },
  { type: "link", href: "/dashboard/messages", label: "Messages", icon: MessageSquare, adminOnly: true },
  { type: "link", href: "/dashboard/api-tester", label: "API Tester", icon: FlaskConical, adminOnly: true },
  { type: "link", href: "/dashboard/admin", label: "Admin", icon: ShieldCheck, adminOnly: true },
];

// Bottom nav items for mobile (most used)
const bottomNavItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/wa-sessions", label: "Sessions", icon: QrCode },
  { href: "/dashboard/wa-send", label: "Send", icon: Smartphone },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (profileData) setProfile(profileData);

      const { data: memberData } = await supabase.from("org_members").select("org_id, role").eq("user_id", user.id).single();

      const meRes = await fetchWithAuth("/api/auth/me");
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.is_admin) setIsAdmin(true);
      }

      if (memberData) {
        const { data: orgData } = await supabase.from("organizations").select("*").eq("id", memberData.org_id).single();
        if (orgData) setOrg(orgData);
      }
      setAuthLoading(false);
    }
    loadData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.push("/login");
      else if (event === "TOKEN_REFRESHED") router.refresh();
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-green-600 flex items-center justify-center">
            <MessageSquare className="h-7 w-7 text-white" />
          </div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const filteredNavItems = navItems.filter((item) => !(item.adminOnly && !isAdmin));

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col bg-white border-r">
        {/* Logo */}
        <div className="px-5 py-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm leading-tight">WA Connect Pro</p>
              {org && <p className="text-xs text-gray-400 truncate max-w-[140px]">{org.name}</p>}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {filteredNavItems.map((item, i) => {
            if (item.type === "separator") {
              return (
                <div key={`sep-${i}`} className="pt-5 pb-1 px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{item.label}</p>
                </div>
              );
            }
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-green-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
                {isActive && <ChevronRight className="h-3 w-3 ml-auto opacity-60" />}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t p-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-green-100 text-green-700 text-sm font-semibold">
                {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{profile?.full_name || "User"}</p>
              <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MOBILE HEADER ───────────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-green-600 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">WA Connect Pro</p>
            {org && <p className="text-xs text-gray-400 truncate max-w-[160px]">{org.name}</p>}
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <Menu className="h-5 w-5 text-gray-600" />
        </button>
      </header>

      {/* ── MOBILE SLIDE DRAWER ─────────────────────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />

          {/* Drawer */}
          <div className="relative ml-auto w-72 bg-white h-full flex flex-col shadow-2xl">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-green-600 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-white" />
                </div>
                <p className="font-bold text-gray-900">WA Connect Pro</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
              {filteredNavItems.map((item, i) => {
                if (item.type === "separator") {
                  return (
                    <div key={`sep-${i}`} className="pt-5 pb-1 px-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{item.label}</p>
                    </div>
                  );
                }
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? "bg-green-600 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {item.label}
                    {isActive && <ChevronRight className="h-4 w-4 ml-auto opacity-60" />}
                  </Link>
                );
              })}
            </nav>

            {/* User + logout */}
            <div className="border-t p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-green-100 text-green-700 font-semibold">
                    {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{profile?.full_name || "User"}</p>
                  <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ────────────────────────────────────────── */}
      <main className="lg:pl-64">
        {/* Top padding for mobile header */}
        <div className="pt-14 lg:pt-0">
          <div className="p-4 lg:p-6 pb-24 lg:pb-6">
            {children}
          </div>
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAV (app-like) ────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t">
        <div className="flex items-center justify-around py-1">
          {bottomNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-0 ${
                  isActive ? "text-green-600" : "text-gray-400"
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? "bg-green-50" : ""}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <span className={`text-[10px] font-medium truncate ${isActive ? "text-green-600" : "text-gray-400"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

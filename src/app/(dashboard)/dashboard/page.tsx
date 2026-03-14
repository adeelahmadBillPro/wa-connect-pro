"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare, Users, Send, CheckCheck, XCircle, Eye, Wifi, Smartphone } from "lucide-react";

interface DashboardStats {
  totalContacts: number;
  totalMessages: number;
  sentToday: number;
  deliveredToday: number;
  readToday: number;
  failedToday: number;
  credits: number;
  waSessionsConnected: number;
  waMsgsSentToday: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalContacts: 0,
    totalMessages: 0,
    sentToday: 0,
    deliveredToday: 0,
    readToday: 0,
    failedToday: 0,
    credits: 0,
    waSessionsConnected: 0,
    waMsgsSentToday: 0,
  });
  const [orgName, setOrgName] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function loadStats() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get org
      const { data: member } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .single();
      if (!member) return;

      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", member.org_id)
        .single();
      if (org) {
        setOrgName(org.name);

        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString();

        // Parallel queries
        const [contactsRes, allMsgsRes, todayMsgsRes, waSessionsRes, waMsgsTodayRes] = await Promise.all([
          supabase
            .from("contacts")
            .select("id", { count: "exact", head: true })
            .eq("org_id", org.id),
          supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("org_id", org.id),
          supabase
            .from("messages")
            .select("status")
            .eq("org_id", org.id)
            .gte("created_at", todayStr),
          supabase
            .from("wa_sessions")
            .select("id", { count: "exact", head: true })
            .eq("org_id", org.id)
            .eq("status", "connected"),
          supabase
            .from("wa_sessions")
            .select("messages_sent_today")
            .eq("org_id", org.id),
        ]);

        const todayMsgs = todayMsgsRes.data || [];
        const totalWaMsgsToday = (waMsgsTodayRes.data || []).reduce(
          (sum: number, s: any) => sum + (s.messages_sent_today || 0), 0
        );

        setStats({
          totalContacts: contactsRes.count || 0,
          totalMessages: allMsgsRes.count || 0,
          sentToday: todayMsgs.filter((m) => m.status === "sent").length,
          deliveredToday: todayMsgs.filter((m) => m.status === "delivered").length,
          readToday: todayMsgs.filter((m) => m.status === "read").length,
          failedToday: todayMsgs.filter((m) => m.status === "failed").length,
          credits: org.credits,
          waSessionsConnected: waSessionsRes.count || 0,
          waMsgsSentToday: totalWaMsgsToday,
        });
      }
    }
    loadStats();
  }, []);

  const statCards = [
    {
      title: "WA Sessions",
      value: stats.waSessionsConnected,
      icon: Wifi,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      title: "WA Msgs Today",
      value: stats.waMsgsSentToday,
      icon: Smartphone,
      color: "text-teal-600",
      bg: "bg-teal-50",
    },
    {
      title: "Total Contacts",
      value: stats.totalContacts,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "API Messages",
      value: stats.totalMessages,
      icon: MessageSquare,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
    {
      title: "Delivered",
      value: stats.deliveredToday,
      icon: CheckCheck,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Failed",
      value: stats.failedToday,
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        {orgName && (
          <p className="text-gray-500 mt-1">Welcome back, {orgName}</p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="pt-6">
              <div className={`inline-flex p-2 rounded-lg ${stat.bg} mb-3`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Credits Card */}
      <Card>
        <CardHeader>
          <CardTitle>Credits Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-4xl font-bold text-green-600">{stats.credits}</p>
              <p className="text-gray-500 mt-1">messages remaining</p>
            </div>
            <a
              href="/dashboard/credits"
              className="text-green-600 hover:underline text-sm font-medium"
            >
              Buy more credits
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

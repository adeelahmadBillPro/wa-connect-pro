"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Users,
  CheckCheck,
  XCircle,
  Wifi,
  Smartphone,
  Package,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import type { Subscription, SubscriptionPlan } from "@/types/database";

const UNLIMITED_THRESHOLD = 999999;

interface SubscriptionWithPlan extends Subscription {
  plan: SubscriptionPlan;
}

interface DashboardStats {
  totalContacts: number;
  totalMessages: number;
  deliveredToday: number;
  failedToday: number;
  waSessionsConnected: number;
  waMsgsSentToday: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalContacts: 0,
    totalMessages: 0,
    deliveredToday: 0,
    failedToday: 0,
    waSessionsConnected: 0,
    waMsgsSentToday: 0,
  });
  const [orgName, setOrgName] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadStats() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

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
      if (!org) return;

      setOrgName(org.name);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      const [contactsRes, allMsgsRes, todayMsgsRes, waSessionsRes, waMsgsTodayRes, subRes] =
        await Promise.all([
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
          supabase
            .from("subscriptions")
            .select("*, plan:subscription_plans(*)")
            .eq("org_id", org.id)
            .eq("status", "active")
            .gte("expires_at", new Date().toISOString())
            .order("expires_at", { ascending: false })
            .limit(1)
            .single(),
        ]);

      const todayMsgs = todayMsgsRes.data || [];
      const totalWaMsgsToday = (waMsgsTodayRes.data || []).reduce(
        (sum: number, s: { messages_sent_today: number }) =>
          sum + (s.messages_sent_today || 0),
        0
      );

      if (subRes.data) setSubscription(subRes.data as SubscriptionWithPlan);

      setStats({
        totalContacts: contactsRes.count || 0,
        totalMessages: allMsgsRes.count || 0,
        deliveredToday: todayMsgs.filter((m) => m.status === "delivered").length,
        failedToday: todayMsgs.filter((m) => m.status === "failed").length,
        waSessionsConnected: waSessionsRes.count || 0,
        waMsgsSentToday: totalWaMsgsToday,
      });
    }
    loadStats();
  }, []);

  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const isUnlimited = subscription?.plan
    ? subscription.plan.message_limit >= UNLIMITED_THRESHOLD
    : false;

  const messagesLeft = subscription?.plan
    ? isUnlimited ? Infinity : Math.max(0, subscription.plan.message_limit - subscription.messages_used)
    : 0;

  const usagePercent = subscription?.plan
    ? isUnlimited ? 0 : Math.round((subscription.messages_used / subscription.plan.message_limit) * 100)
    : 0;

  const statCards = [
    { title: "WA Sessions", value: stats.waSessionsConnected, icon: Wifi, color: "text-green-600", bg: "bg-green-50" },
    { title: "WA Msgs Today", value: stats.waMsgsSentToday, icon: Smartphone, color: "text-teal-600", bg: "bg-teal-50" },
    { title: "Total Contacts", value: stats.totalContacts, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Delivered", value: stats.deliveredToday, icon: CheckCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "Failed", value: stats.failedToday, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
    { title: "Total Messages", value: stats.totalMessages, icon: MessageSquare, color: "text-indigo-600", bg: "bg-indigo-50" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        {orgName && <p className="text-gray-500 mt-1">Welcome back, {orgName}</p>}
      </div>

      {/* Subscription Banner */}
      {subscription ? (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-50 rounded-lg">
                  <Package className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{subscription.plan.name}</h3>
                    {subscription.plan.price_monthly === 0 ? (
                      <Badge className="bg-blue-100 text-blue-700">Trial</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-700">Active</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {isUnlimited ? "Unlimited" : messagesLeft.toLocaleString()} messages left &middot; {daysLeft} days remaining
                    {subscription.plan.price_monthly === 0 && " — Upgrade for more messages!"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${usagePercent >= 90 ? "bg-red-500" : usagePercent >= 70 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(usagePercent, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{usagePercent}% used</p>
                </div>
                <Link href="/dashboard/billing">
                  <Button variant="outline" size="sm">
                    Manage <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
            {(daysLeft <= 5 || usagePercent >= 90) && (
              <div className="mt-4 flex items-center gap-2 text-amber-600 text-sm bg-amber-50 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>
                  {daysLeft <= 5 && daysLeft > 0 ? `Your plan expires in ${daysLeft} day${daysLeft > 1 ? "s" : ""}. ` : ""}
                  {usagePercent >= 90 ? "Running low on messages. " : ""}
                  <Link href="/dashboard/billing" className="underline font-medium">Renew or upgrade</Link>
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="font-semibold text-amber-800">No Active Plan</p>
                  <p className="text-sm text-amber-700">Subscribe to a plan to start sending messages.</p>
                </div>
              </div>
              <Link href="/dashboard/billing">
                <Button className="bg-green-600 hover:bg-green-700">
                  View Plans <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Getting Started - only show for new users */}
      {stats.totalContacts === 0 && stats.waSessionsConnected === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Getting Started</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/dashboard/contacts" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg"><Users className="h-5 w-5 text-blue-600" /></div>
                  <div>
                    <p className="font-medium text-sm">Add Contacts</p>
                    <p className="text-xs text-gray-500">Import or add contacts to send messages to</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </Link>
              <Link href="/dashboard/wa-sessions" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg"><Wifi className="h-5 w-5 text-green-600" /></div>
                  <div>
                    <p className="font-medium text-sm">Connect WhatsApp</p>
                    <p className="text-xs text-gray-500">Scan QR code to link your WhatsApp number</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </Link>
              <Link href="/dashboard/wa-send" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-50 rounded-lg"><Smartphone className="h-5 w-5 text-teal-600" /></div>
                  <div>
                    <p className="font-medium text-sm">Send Messages</p>
                    <p className="text-xs text-gray-500">Send single or bulk WhatsApp messages</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Calendar, TrendingUp, Package } from "lucide-react";
import type { Subscription, SubscriptionPlan } from "@/types/database";

interface SubscriptionWithPlan extends Subscription {
  plan: SubscriptionPlan;
}

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
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

    const { data: activeSub } = await supabase
      .from("subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("org_id", member.org_id)
      .eq("status", "active")
      .gte("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .single();

    if (activeSub) setSubscription(activeSub as SubscriptionWithPlan);
    setLoading(false);
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const messagesLeft = subscription?.plan
    ? Math.max(0, subscription.plan.message_limit - subscription.messages_used)
    : 0;

  const usagePercent = subscription?.plan
    ? Math.round((subscription.messages_used / subscription.plan.message_limit) * 100)
    : 0;

  if (!subscription) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-500 mt-1">Your subscription plan and usage</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-red-600 font-semibold text-lg mb-2">No Active Subscription</p>
            <p className="text-gray-500">
              Your subscription is not active. Please contact the platform administrator to activate your plan.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Billing</h1>
        <p className="text-gray-500 mt-1">Your subscription plan and usage</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{subscription.plan.name}</p>
                <p className="text-sm text-gray-500">Current Plan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{messagesLeft.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Messages Remaining</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{subscription.messages_used.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Messages Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{daysLeft}</p>
                <p className="text-sm text-gray-500">Days Remaining</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Progress */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Monthly Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
            <div
              className={`h-4 rounded-full transition-all ${
                usagePercent >= 90 ? "bg-red-500" : usagePercent >= 70 ? "bg-yellow-500" : "bg-green-500"
              }`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>{subscription.messages_used.toLocaleString()} used</span>
            <span>{subscription.plan.message_limit.toLocaleString()} limit</span>
          </div>
          {usagePercent >= 90 && (
            <p className="text-red-600 text-sm mt-3 font-medium">
              You are close to your message limit. Contact admin to upgrade your plan.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Plan Details */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Plan</p>
              <p className="font-semibold text-lg">{subscription.plan.name}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Status</p>
              <Badge className="bg-green-100 text-green-700">Active</Badge>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Message Limit</p>
              <p className="font-semibold">{subscription.plan.message_limit.toLocaleString()} / month</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Started</p>
              <p className="font-semibold">{new Date(subscription.starts_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Expires</p>
              <p className="font-semibold">{new Date(subscription.expires_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Usage</p>
              <p className="font-semibold">{usagePercent}%</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-6">
            To upgrade or renew your plan, please contact the platform administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

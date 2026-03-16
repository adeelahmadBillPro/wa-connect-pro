import { SupabaseClient } from "@supabase/supabase-js";

interface SubscriptionCheck {
  allowed: boolean;
  error?: string;
  subscription?: {
    id: string;
    plan_name: string;
    messages_used: number;
    message_limit: number;
    messages_remaining: number;
  };
}

// Check if org has an active subscription with remaining messages
// Returns { allowed, error, subscription }
export async function checkSubscription(
  supabase: SupabaseClient,
  orgId: string
): Promise<SubscriptionCheck> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, messages_used, plan:subscription_plans(name, message_limit)")
    .eq("org_id", orgId)
    .eq("status", "active")
    .gte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub || !sub.plan) {
    return {
      allowed: false,
      error: "No active subscription. Please subscribe to a plan first.",
    };
  }

  const planData = sub.plan as unknown;
  const plan = (Array.isArray(planData) ? planData[0] : planData) as { name: string; message_limit: number };
  const remaining = plan.message_limit - sub.messages_used;

  if (remaining <= 0) {
    return {
      allowed: false,
      error: `Message limit reached (${plan.message_limit}/${plan.message_limit}). Please upgrade or renew your plan.`,
    };
  }

  return {
    allowed: true,
    subscription: {
      id: sub.id,
      plan_name: plan.name,
      messages_used: sub.messages_used,
      message_limit: plan.message_limit,
      messages_remaining: remaining,
    },
  };
}

// Increment messages_used counter on subscription
export async function incrementSubscriptionUsage(
  supabase: SupabaseClient,
  subscriptionId: string,
  count: number = 1
) {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("messages_used")
    .eq("id", subscriptionId)
    .single();

  if (sub) {
    await supabase
      .from("subscriptions")
      .update({ messages_used: sub.messages_used + count })
      .eq("id", subscriptionId);
  }
}

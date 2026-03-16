import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { isPlatformAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// POST — create/renew subscription for an org
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || !isPlatformAdmin(user.id)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const serviceClient = createServiceClient();
    const { org_id, plan_id, months = 1 } = await request.json();

    if (!org_id || !plan_id) {
      return NextResponse.json(
        { error: "org_id and plan_id are required" },
        { status: 400 }
      );
    }

    // Get plan
    const { data: plan } = await serviceClient
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Expire any existing active subscription
    await serviceClient
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("org_id", org_id)
      .eq("status", "active");

    // Create new subscription
    const startsAt = new Date();
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const { data: subscription, error } = await serviceClient
      .from("subscriptions")
      .insert({
        org_id,
        plan_id,
        status: "active",
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        messages_used: 0,
      })
      .select("*, plan:subscription_plans(*)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, subscription });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH — extend subscription (add days or bonus messages)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || !isPlatformAdmin(user.id)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const serviceClient = createServiceClient();
    const { org_id, add_days, add_messages } = await request.json();

    if (!org_id) {
      return NextResponse.json({ error: "org_id is required" }, { status: 400 });
    }

    if (!add_days && !add_messages) {
      return NextResponse.json(
        { error: "Provide add_days and/or add_messages" },
        { status: 400 }
      );
    }

    // Find active subscription
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("org_id", org_id)
      .eq("status", "active")
      .gte("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .single();

    if (!sub) {
      return NextResponse.json(
        { error: "No active subscription found for this organization" },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {};

    // Extend expiry date
    if (add_days && add_days > 0) {
      const currentExpiry = new Date(sub.expires_at);
      currentExpiry.setDate(currentExpiry.getDate() + add_days);
      updates.expires_at = currentExpiry.toISOString();
    }

    // Add bonus messages (reduce messages_used to give more room, but not below 0)
    if (add_messages && add_messages > 0) {
      updates.messages_used = Math.max(0, sub.messages_used - add_messages);
    }

    const { error } = await serviceClient
      .from("subscriptions")
      .update(updates)
      .eq("id", sub.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      extended: {
        add_days: add_days || 0,
        add_messages: add_messages || 0,
        new_expiry: updates.expires_at || sub.expires_at,
        new_messages_used: updates.messages_used ?? sub.messages_used,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

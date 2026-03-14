import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST — create/renew subscription for an org
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceClient();

    // Verify admin
    const { data: member } = await serviceClient
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .single();

    if (!member) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

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

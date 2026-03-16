import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { isPlatformAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// GET — list all plans
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || !isPlatformAdmin(user.id)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const supabase = createServiceClient();
    const { data: plans } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("price_monthly", { ascending: true });

    return NextResponse.json({ plans: plans || [] });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create a new plan
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || !isPlatformAdmin(user.id)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const supabase = createServiceClient();
    const { name, description, price_monthly, message_limit } = await request.json();

    if (!name || !price_monthly || !message_limit) {
      return NextResponse.json(
        { error: "name, price_monthly, and message_limit are required" },
        { status: 400 }
      );
    }

    const { data: plan, error } = await supabase
      .from("subscription_plans")
      .insert({
        name,
        description: description || null,
        price_monthly,
        message_limit,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, plan });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — update a plan
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || !isPlatformAdmin(user.id)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const supabase = createServiceClient();
    const { plan_id, ...updates } = await request.json();

    if (!plan_id) {
      return NextResponse.json({ error: "plan_id is required" }, { status: 400 });
    }

    const allowed = ["name", "description", "price_monthly", "message_limit", "is_active"];
    const filtered: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) filtered[key] = updates[key];
    }

    const { error } = await supabase
      .from("subscription_plans")
      .update(filtered)
      .eq("id", plan_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { isPlatformAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// GET — list all pending/recent payment receipts
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || !isPlatformAdmin(user.id)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const supabase = createServiceClient();
    const status = request.nextUrl.searchParams.get("status"); // "pending", "confirmed", "rejected", or null for all

    let query = supabase
      .from("payment_receipts")
      .select("*, plan:subscription_plans(*), organization:organizations(name, slug)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: receipts } = await query;

    return NextResponse.json({ receipts: receipts || [] });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — confirm or reject a receipt
// When confirmed with a plan_id, also activates the subscription automatically
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || !isPlatformAdmin(user.id)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const supabase = createServiceClient();
    const { receipt_id, status, admin_notes, months = 1 } = await request.json();

    if (!receipt_id || !["confirmed", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "receipt_id and valid status (confirmed/rejected) required" },
        { status: 400 }
      );
    }

    // Get the receipt details
    const { data: receipt } = await supabase
      .from("payment_receipts")
      .select("*")
      .eq("id", receipt_id)
      .single();

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // Update receipt status
    const { error } = await supabase
      .from("payment_receipts")
      .update({
        status,
        admin_notes: admin_notes || null,
      })
      .eq("id", receipt_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If confirmed and has a plan, activate subscription automatically
    let subscription = null;
    if (status === "confirmed" && receipt.plan_id) {
      // Get the plan to verify it exists
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("id", receipt.plan_id)
        .single();

      if (plan) {
        // Expire any existing active subscription
        await supabase
          .from("subscriptions")
          .update({ status: "expired" })
          .eq("org_id", receipt.org_id)
          .eq("status", "active");

        // Create new subscription
        const startsAt = new Date();
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + months);

        const { data: newSub } = await supabase
          .from("subscriptions")
          .insert({
            org_id: receipt.org_id,
            plan_id: receipt.plan_id,
            status: "active",
            starts_at: startsAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            messages_used: 0,
          })
          .select("*, plan:subscription_plans(*)")
          .single();

        subscription = newSub;

        // Also approve the org if not already approved
        await supabase
          .from("organizations")
          .update({ is_approved: true })
          .eq("id", receipt.org_id);
      }
    }

    return NextResponse.json({
      success: true,
      subscription_activated: !!subscription,
      subscription,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

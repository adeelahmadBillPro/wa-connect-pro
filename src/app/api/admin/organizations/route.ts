import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { isPlatformAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// GET all organizations (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is platform admin
    if (!isPlatformAdmin(user.id)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const serviceClient = createServiceClient();

    // Fetch all organizations with owner info
    const { data: orgs, error } = await serviceClient
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get message counts per org
    const orgIds = orgs.map((o: { id: string }) => o.id);
    const { data: messageCounts } = await serviceClient
      .from("messages")
      .select("org_id")
      .in("org_id", orgIds);

    const countMap: Record<string, number> = {};
    messageCounts?.forEach((m: { org_id: string }) => {
      countMap[m.org_id] = (countMap[m.org_id] || 0) + 1;
    });

    const orgsWithCounts = orgs.map((org: Record<string, unknown>) => ({
      ...org,
      message_count: countMap[org.id as string] || 0,
    }));

    return NextResponse.json({ organizations: orgsWithCounts });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH — update org WhatsApp credentials or credits
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isPlatformAdmin(user.id)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const serviceClient = createServiceClient();
    const body = await request.json();
    const { org_id, ...updates } = body;

    if (!org_id) {
      return NextResponse.json({ error: "org_id is required" }, { status: 400 });
    }

    // Only allow specific fields to be updated
    const allowedFields = [
      "whatsapp_phone_number_id",
      "whatsapp_business_account_id",
      "whatsapp_access_token",
      "whatsapp_connected",
      "whatsapp_display_name",
      "whatsapp_number",
      "credits",
      "is_approved",
    ];

    const safeUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) {
        safeUpdates[key] = updates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // If adding credits, also log the transaction
    if ("credits" in safeUpdates) {
      const { data: currentOrg } = await serviceClient
        .from("organizations")
        .select("credits")
        .eq("id", org_id)
        .single();

      const oldCredits = currentOrg?.credits || 0;
      const newCredits = safeUpdates.credits as number;
      const diff = newCredits - oldCredits;

      if (diff > 0) {
        await serviceClient.from("credit_transactions").insert({
          org_id,
          amount: diff,
          type: "purchase",
          description: `Admin added ${diff} credits`,
          balance_after: newCredits,
        });
      }
    }

    const { error } = await serviceClient
      .from("organizations")
      .update(safeUpdates)
      .eq("id", org_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

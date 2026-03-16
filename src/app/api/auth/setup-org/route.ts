import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyAdminNewSignup } from "@/lib/notify-admin";

export const dynamic = "force-dynamic";

// Creates organization and org_member after signup
// Uses service role to bypass RLS
export async function POST(request: NextRequest) {
  try {
    const { userId, orgName, userEmail, userName } = await request.json();

    if (!userId || !orgName) {
      return NextResponse.json(
        { error: "userId and orgName are required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Verify the user exists
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", userId)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Create organization
    const slug =
      orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      Date.now().toString(36);

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: orgName,
        slug,
        owner_id: userId,
      })
      .select()
      .single();

    if (orgError) {
      console.error("Org creation error:", orgError);
      return NextResponse.json(
        { error: orgError.message },
        { status: 500 }
      );
    }

    // Add user as owner
    const { error: memberError } = await supabase
      .from("org_members")
      .insert({
        org_id: org.id,
        user_id: userId,
        role: "owner",
      });

    if (memberError) {
      console.error("Member creation error:", memberError);
      return NextResponse.json(
        { error: memberError.message },
        { status: 500 }
      );
    }

    // Create free trial subscription
    const trialMessages = parseInt(process.env.FREE_TRIAL_MESSAGES || "100");
    if (trialMessages > 0) {
      try {
        // Look for existing "Free Trial" plan or create inline subscription
        let trialPlanId: string | null = null;
        const { data: trialPlan } = await supabase
          .from("subscription_plans")
          .select("id")
          .ilike("name", "%free trial%")
          .limit(1)
          .single();

        if (trialPlan) {
          trialPlanId = trialPlan.id;
        } else {
          // Create a Free Trial plan
          const { data: newPlan } = await supabase
            .from("subscription_plans")
            .insert({
              name: "Free Trial",
              description: `${trialMessages} free messages to test the platform`,
              price_monthly: 0,
              message_limit: trialMessages,
              is_active: false, // hidden from billing page
            })
            .select("id")
            .single();
          if (newPlan) trialPlanId = newPlan.id;
        }

        if (trialPlanId) {
          const trialExpiry = new Date();
          trialExpiry.setDate(trialExpiry.getDate() + 7); // 7-day trial

          await supabase.from("subscriptions").insert({
            org_id: org.id,
            plan_id: trialPlanId,
            status: "active",
            starts_at: new Date().toISOString(),
            expires_at: trialExpiry.toISOString(),
            messages_used: 0,
          });
        }
      } catch (err) {
        console.error("Free trial creation failed:", err);
      }
    }

    // Notify admin about new signup (fire and forget)
    notifyAdminNewSignup({
      userName: userName || profile.full_name || "Unknown",
      userEmail: userEmail || profile.email || "Unknown",
      orgName,
    }).catch((err) => console.error("Admin notification failed:", err));

    return NextResponse.json({ success: true, org });
  } catch (error) {
    console.error("Setup org error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

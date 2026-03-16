// Send WhatsApp notification to platform admin when new user signs up
// Uses Meta Cloud API via admin org's WhatsApp credentials — works 24/7 without wwebjs session

import { createServiceClient } from "@/lib/supabase/service";

const ADMIN_PHONE = process.env.ADMIN_WHATSAPP_NUMBER || "923251411320";

interface NewSignupNotification {
  userName: string;
  userEmail: string;
  orgName: string;
}

export async function notifyAdminNewSignup(data: NewSignupNotification) {
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wa-connect-pro-production-990f.up.railway.app";

  const message = `🔔 *New User Signup*\n\n👤 Name: ${data.userName}\n📧 Email: ${data.userEmail}\n🏢 Organization: ${data.orgName}\n\n🔗 Review: ${dashboardUrl}/dashboard/admin`;

  // Try sending via Meta Cloud API using admin org's WhatsApp credentials
  try {
    const supabase = createServiceClient();

    // Get admin user's org with WhatsApp credentials
    const adminIds = (process.env.PLATFORM_ADMIN_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);

    if (adminIds.length > 0) {
      const { data: member } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", adminIds[0])
        .single();

      if (member) {
        const { data: org } = await supabase
          .from("organizations")
          .select("whatsapp_phone_number_id, whatsapp_access_token")
          .eq("id", member.org_id)
          .single();

        if (org?.whatsapp_phone_number_id && org?.whatsapp_access_token) {
          const waResponse = await fetch(
            `https://graph.facebook.com/v21.0/${org.whatsapp_phone_number_id}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${org.whatsapp_access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: ADMIN_PHONE,
                type: "text",
                text: { body: message },
              }),
            }
          );

          if (waResponse.ok) {
            console.log("[NOTIFY] Admin WhatsApp notification sent via Meta API");
            return;
          }
          const errData = await waResponse.json().catch(() => ({}));
          console.error("[NOTIFY] Meta API failed:", waResponse.status, errData);
        } else {
          console.log("[NOTIFY] Admin org has no WhatsApp credentials configured");
        }
      }
    }
  } catch (err) {
    console.error("[NOTIFY] WhatsApp notification failed:", err);
  }

  // Fallback: log to console (admin can check Railway logs)
  console.log("=".repeat(60));
  console.log("NEW USER SIGNUP");
  console.log(`Name: ${data.userName}`);
  console.log(`Email: ${data.userEmail}`);
  console.log(`Organization: ${data.orgName}`);
  console.log(`Review: ${dashboardUrl}/dashboard/admin`);
  console.log("=".repeat(60));
}

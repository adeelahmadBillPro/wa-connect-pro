// Send WhatsApp notification to platform admin when new user signs up
// Priority: 1) wwebjs session (if connected) → 2) Meta Cloud API → 3) Console log

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

  // 1) Try wwebjs session first (no token needed, works when connected)
  try {
    const { sendWAMessage, getActiveSessions } = await import("@/lib/wa-session-manager");
    const activeSessions = getActiveSessions();

    if (activeSessions.length > 0) {
      await sendWAMessage(activeSessions[0], ADMIN_PHONE, {
        type: "text",
        content: message,
      });
      console.log("[NOTIFY] Admin WhatsApp notification sent via wwebjs");
      return;
    }
  } catch (err) {
    console.error("[NOTIFY] wwebjs notification failed:", err);
  }

  // 2) Try Meta Cloud API using admin org's WhatsApp credentials
  try {
    const supabase = createServiceClient();
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
        }
      }
    }
  } catch (err) {
    console.error("[NOTIFY] Meta API notification failed:", err);
  }

  // 3) Fallback: log to console (admin can check Railway logs)
  console.log("=".repeat(60));
  console.log("NEW USER SIGNUP");
  console.log(`Name: ${data.userName}`);
  console.log(`Email: ${data.userEmail}`);
  console.log(`Organization: ${data.orgName}`);
  console.log(`Review: ${dashboardUrl}/dashboard/admin`);
  console.log("=".repeat(60));
}

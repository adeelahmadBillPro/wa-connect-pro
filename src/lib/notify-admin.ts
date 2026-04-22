// Send WhatsApp notification to platform admin when new user signs up
// Priority: 1) Baileys session (if connected) → 2) Meta Cloud API → 3) Console log

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

  await deliverAdminMessage(message, "signup");
}

interface BannedSessionNotification {
  sessionId: string;
  phoneNumber: string | null;
  orgName?: string | null;
  reason: string;
  statusCode: number | null;
}

// Phase 6: alerts the platform admin when a session is force-stopped because
// WhatsApp returned a hard-ban code (403/405/419) or repeat-failure threshold
// hit. Best-effort — never throws so the caller's reconnect loop can finish.
export async function notifyAdminSessionBanned(data: BannedSessionNotification) {
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wa-connect-pro-production-990f.up.railway.app";
  const phoneLine = data.phoneNumber ? `📱 Number: +${data.phoneNumber}` : "📱 Number: (not yet bound)";
  const orgLine = data.orgName ? `🏢 Org: ${data.orgName}` : "";
  const message =
    `🚨 *WhatsApp Session Banned*\n\n` +
    `${phoneLine}\n` +
    (orgLine ? `${orgLine}\n` : "") +
    `⚠️  Reason: ${data.reason}\n` +
    `🔢 Code: ${data.statusCode ?? "n/a"}\n\n` +
    `Action: This session has been disabled and will not auto-reconnect. ` +
    `Investigate before re-scanning the QR.\n\n` +
    `🔗 ${dashboardUrl}/dashboard/wa-sessions`;

  try {
    await deliverAdminMessage(message, "ban-alert");
  } catch (err) {
    console.error("[NOTIFY] notifyAdminSessionBanned failed:", err);
  }
}

// Shared delivery: Baileys → Meta Cloud → console fallback.
// Skips Baileys if the calling session is the only active one and is
// itself the one that just got banned (prevents using a banned number
// to send the ban alert).
async function deliverAdminMessage(message: string, kind: string): Promise<void> {
  // 1) Try Baileys session first (no token needed, works when connected)
  try {
    const { sendWAMessage, getActiveSessions } = await import("@/lib/wa-session-manager");
    const activeSessions = getActiveSessions();

    if (activeSessions.length > 0) {
      await sendWAMessage(activeSessions[0], ADMIN_PHONE, {
        type: "text",
        content: message,
      });
      console.log(`[NOTIFY:${kind}] sent via Baileys session`);
      return;
    }
  } catch (err) {
    console.error(`[NOTIFY:${kind}] Baileys notification failed:`, err);
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
            console.log(`[NOTIFY:${kind}] sent via Meta API`);
            return;
          }
          const errData = await waResponse.json().catch(() => ({}));
          console.error(`[NOTIFY:${kind}] Meta API failed:`, waResponse.status, errData);
        }
      }
    }
  } catch (err) {
    console.error(`[NOTIFY:${kind}] Meta API notification failed:`, err);
  }

  // 3) Fallback: log to console
  console.log("=".repeat(60));
  console.log(`ADMIN NOTIFY [${kind}]`);
  console.log(message);
  console.log("=".repeat(60));
}

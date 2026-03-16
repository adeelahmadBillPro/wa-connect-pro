// Send WhatsApp notification to platform admin when new user signs up
// Uses an active WA session from the admin's org to send the message

import { createServiceClient } from "@/lib/supabase/service";

const ADMIN_PHONE = process.env.ADMIN_WHATSAPP_NUMBER || "923251411320";

interface NewSignupNotification {
  userName: string;
  userEmail: string;
  orgName: string;
}

export async function notifyAdminNewSignup(data: NewSignupNotification) {
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wa-connect-pro-production-990f.up.railway.app";

  const message = `🔔 *New User Signup*\n\n👤 Name: ${data.userName}\n📧 Email: ${data.userEmail}\n🏢 Organization: ${data.orgName}\n\n🔗 Review: ${dashboardUrl}/dashboard`;

  // Try sending via WhatsApp using any active WA session
  try {
    const { sendWAMessage, getActiveSessions } = await import("@/lib/wa-session-manager");
    const activeSessions = getActiveSessions();

    if (activeSessions.length > 0) {
      await sendWAMessage(activeSessions[0], ADMIN_PHONE, {
        type: "text",
        content: message,
      });
      console.log("[NOTIFY] Admin WhatsApp notification sent");
      return;
    }
    console.log("[NOTIFY] No active WA sessions, falling back to console log");
  } catch (err) {
    console.error("[NOTIFY] WhatsApp notification failed:", err);
  }

  // Fallback: log to console (admin can check Railway logs)
  console.log("=".repeat(60));
  console.log("NEW USER SIGNUP");
  console.log(`Name: ${data.userName}`);
  console.log(`Email: ${data.userEmail}`);
  console.log(`Organization: ${data.orgName}`);
  console.log(`Review: ${dashboardUrl}/dashboard`);
  console.log("=".repeat(60));
}

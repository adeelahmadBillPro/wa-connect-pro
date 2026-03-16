// Send email notification to platform admin when new user signs up
// Uses Supabase's built-in email via the admin notifications table + edge function
// For now, we use a simple approach: store notification in DB and send via Resend/SMTP

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "adeel.ahmad8000@gmail.com";

interface NewSignupNotification {
  userName: string;
  userEmail: string;
  orgName: string;
}

export async function notifyAdminNewSignup(data: NewSignupNotification) {
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wa-connect-pro-production-990f.up.railway.app";

  // Try Resend if API key is configured
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "WA Connect Pro <onboarding@resend.dev>",
          to: ADMIN_EMAIL,
          subject: `New Signup: ${data.orgName} - Pending Approval`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #16a34a; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">New User Signup</h2>
              </div>
              <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                <p>A new user has signed up and is waiting for approval:</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px; font-weight: bold;">Name:</td><td style="padding: 8px;">${data.userName}</td></tr>
                  <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${data.userEmail}</td></tr>
                  <tr><td style="padding: 8px; font-weight: bold;">Organization:</td><td style="padding: 8px;">${data.orgName}</td></tr>
                </table>
                <div style="margin-top: 20px; text-align: center;">
                  <a href="${dashboardUrl}/dashboard/admin" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                    Review in Admin Panel
                  </a>
                </div>
              </div>
            </div>
          `,
        }),
      });

      if (res.ok) {
        console.log("[NOTIFY] Admin email sent via Resend");
        return;
      }
      console.error("[NOTIFY] Resend failed:", await res.text());
    } catch (err) {
      console.error("[NOTIFY] Resend error:", err);
    }
  }

  // Fallback: log to console (admin can check Railway logs)
  console.log("=".repeat(60));
  console.log("NEW USER SIGNUP - PENDING APPROVAL");
  console.log(`Name: ${data.userName}`);
  console.log(`Email: ${data.userEmail}`);
  console.log(`Organization: ${data.orgName}`);
  console.log(`Review: ${dashboardUrl}/dashboard/admin`);
  console.log("=".repeat(60));
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendWAMessage } from "@/lib/wa-session-manager";
import { checkSubscription, incrementSubscriptionUsage } from "@/lib/check-subscription";
import {
  assertWithinCooldown,
  recordRecipientSend,
  RecipientCooldownError,
} from "@/lib/recipient-cooldown";
import { withRateLimitHeaders } from "@/lib/rate-limit-headers";

export const dynamic = "force-dynamic";

// External API endpoint — authenticated via API key (Bearer token)
// Sends via WhatsApp Web session (no Meta API fees)
export async function POST(request: NextRequest) {
  try {
    // Extract API key from Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header. Use: Bearer your_api_key" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();

    // Look up organization by API key
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("api_key", apiKey)
      .single();

    if (!org) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    // Parse body
    const body = await request.json();
    const { to, message, type, media_url, media_data, media_mimetype, media_filename, caption, patient_name } = body;

    if (!to) {
      return NextResponse.json(
        { error: "'to' (phone number) is required" },
        { status: 400 }
      );
    }

    if (!message && !media_url && !media_data) {
      return NextResponse.json(
        { error: "'message', 'media_url', or 'media_data' is required" },
        { status: 400 }
      );
    }

    // Personalize message: replace {{name}} with patient_name
    let finalMessage = message || caption || "";
    if (patient_name) {
      finalMessage = finalMessage.replace(/\{\{name\}\}/g, patient_name);
      finalMessage = finalMessage.replace(/\{\{1\}\}/g, patient_name);
    }

    // Check subscription limits
    const subCheck = await checkSubscription(supabase, org.id);
    if (!subCheck.allowed) {
      return NextResponse.json(
        { error: subCheck.error },
        { status: 429 }
      );
    }

    // Per-recipient cooldown — no-op when org has it set to 0 (the default).
    // Runs BEFORE we attempt the send so we don't burn API/session work on
    // a request we're going to refuse. No credit is deducted on a cooldown
    // rejection (we never reach incrementSubscriptionUsage below).
    const cooldownLimit = Number(org.per_recipient_daily_limit ?? 0);
    if (cooldownLimit > 0) {
      const cleanRecipient = String(to).replace(/[^0-9]/g, "");
      try {
        await assertWithinCooldown(supabase, org.id, cleanRecipient, cooldownLimit);
      } catch (e) {
        if (e instanceof RecipientCooldownError) {
          return NextResponse.json(
            { error: e.message, code: "RECIPIENT_COOLDOWN" },
            { status: 429 },
          );
        }
        throw e;
      }
    }

    // Find a connected WA session for this org. Trust the DB status; the
    // subscription's monthly quota (checked upstream) is the business gate,
    // and sendWAMessage() below is the ground-truth liveness check.
    const { data: sessions } = await supabase
      .from("wa_sessions")
      .select("id, daily_limit, messages_sent_today")
      .eq("org_id", org.id)
      .eq("status", "connected");

    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        { error: "No active WhatsApp Web session. Please scan QR code in dashboard first." },
        { status: 400 }
      );
    }

    // Load-balance across the org's sessions (least-used first). No hard
    // per-session daily cap — customers on paid plans get to spend their
    // monthly quota however they like.
    const available = sessions
      .slice()
      .sort((a, b) => a.messages_sent_today - b.messages_sent_today)[0];

    // Send the message
    const msgType = type || (media_url || media_data ? "image" : "text");

    const result = await sendWAMessage(available.id, to, {
      type: msgType,
      content: finalMessage,
      mediaUrl: media_url,
      mediaData: media_data,
      mediaMimetype: media_mimetype,
      filename: media_filename,
      caption: caption || finalMessage,
    });

    // Save to messages table
    const { data: savedMessage } = await supabase
      .from("messages")
      .insert({
        org_id: org.id,
        to_phone: to.replace(/[^0-9+]/g, ""),
        message_type: msgType,
        content: finalMessage,
        media_url: media_url || null,
        status: result.success ? "sent" : "failed",
        whatsapp_message_id: result.messageId,
        wa_session_id: available.id,
        sent_at: result.success ? new Date().toISOString() : null,
      })
      .select()
      .single();

    // Update session counter
    const { data: currentSession } = await supabase
      .from("wa_sessions")
      .select("messages_sent_today")
      .eq("id", available.id)
      .single();

    await supabase
      .from("wa_sessions")
      .update({
        messages_sent_today: (currentSession?.messages_sent_today || 0) + 1,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", available.id);

    // Increment subscription usage
    if (result.success && subCheck.subscription) {
      await incrementSubscriptionUsage(supabase, subCheck.subscription.id);
    }

    // Record per-recipient hit (no-op when cooldownLimit === 0)
    if (result.success) {
      await recordRecipientSend(
        supabase,
        org.id,
        to.replace(/[^0-9]/g, ""),
        cooldownLimit,
      );
    }

    // Log API call
    await supabase.from("api_logs").insert({
      org_id: org.id,
      endpoint: "/api/v1/wa/send",
      method: "POST",
      status_code: 200,
      request_body: JSON.stringify({ to, message: finalMessage, type: msgType }),
      response_body: JSON.stringify({ message_id: savedMessage?.id, status: "sent" }),
    });

    // Fire-and-forget webhook callback if org has a webhook_url
    if (org.webhook_url) {
      try {
        const webhookPayload = {
          event: result.success ? "message.sent" : "message.failed",
          message_id: savedMessage?.id,
          to_phone: to.replace(/[^0-9+]/g, ""),
          type: msgType,
          status: result.success ? "sent" : "failed",
          timestamp: new Date().toISOString(),
          ...(result.success ? {} : { error: "Send failure" }),
        };

        fetch(org.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
        }).catch(() => {
          // Silently ignore webhook delivery failures
        });
      } catch {
        // Never let webhook errors affect the main response
      }
    }

    return await withRateLimitHeaders(supabase, org.id, NextResponse.json({
      success: true,
      message_id: savedMessage?.id,
      status: "sent",
      session_phone: available.id,
    }));
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to send message" },
      { status: 500 }
    );
  }
}

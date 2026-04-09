import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendWAMessage, pickBestSession } from "@/lib/wa-session-manager";

export const dynamic = "force-dynamic";

// ── Helper: deduct credit after successful/failed send ────────────────────────
async function deductCredit(
  supabase: any,
  orgId: string,
  subscriptionId: string,
  messagesUsed: number,
  messageLimit: number,
  description: string
) {
  const newUsed = messagesUsed + 1;
  const remaining = Math.max(0, messageLimit - newUsed);
  await Promise.all([
    supabase.from("organizations").update({ credits: remaining }).eq("id", orgId),
    supabase.from("subscriptions").update({ messages_used: newUsed }).eq("id", subscriptionId),
    supabase.from("credit_transactions").insert({
      org_id: orgId, amount: 1, type: "usage",
      description, balance_after: remaining,
    }),
  ]);
  return remaining;
}

// ── External API — authenticated via API key (Bearer token) ──────────────────
export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth ────────────────────────────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing Authorization header. Use: Authorization: Bearer your_api_key" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "").trim();
    const supabase = createServiceClient();

    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("api_key", apiKey)
      .single();

    if (!org) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    // ── 2. Subscription check ──────────────────────────────────────────────────
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("org_id", org.id)
      .eq("status", "active")
      .gte("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .single();

    if (!subscription) {
      return NextResponse.json(
        { error: "No active subscription. Please contact admin." },
        { status: 403 }
      );
    }

    const planLimit = subscription.plan?.message_limit || 0;
    const isUnlimited = planLimit >= 999999;
    const remaining = isUnlimited ? Infinity : planLimit - subscription.messages_used;

    if (!isUnlimited && remaining <= 0) {
      return NextResponse.json(
        {
          error: "Monthly message limit reached. Please upgrade your plan.",
          messages_used: subscription.messages_used,
          message_limit: planLimit,
        },
        { status: 429 }
      );
    }

    // ── 3. Parse & validate body ───────────────────────────────────────────────
    const body = await request.json();
    const { to, message, template, params, media_url, media_type, caption, media_base64, filename } = body;

    if (!to) {
      return NextResponse.json(
        { error: "'to' is required. Provide phone number with country code e.g. 923001234567" },
        { status: 400 }
      );
    }

    const cleanPhone = String(to).replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return NextResponse.json(
        { error: `Invalid phone number '${to}'. Must be 10-15 digits with country code e.g. 923001234567` },
        { status: 400 }
      );
    }

    if (!message && !media_url && !media_base64 && !template) {
      return NextResponse.json(
        { error: "Provide one of: 'message' (text), 'media_url' (file URL), 'media_base64' (file base64), or 'template' (template name)" },
        { status: 400 }
      );
    }

    // ── 4. Find best WhatsApp session ──────────────────────────────────────────
    const { data: waSessions } = await supabase
      .from("wa_sessions")
      .select("id, daily_limit, messages_sent_today")
      .eq("org_id", org.id)
      .eq("status", "connected")
      .eq("is_active", true);

    const activeSession = pickBestSession(waSessions || []);

    if (!activeSession) {
      return NextResponse.json(
        { error: "No WhatsApp session connected. Please scan QR code in your dashboard." },
        { status: 400 }
      );
    }

    // ── 5. Build message payload ───────────────────────────────────────────────
    let msgType: "text" | "image" | "document" | "video" = "text";
    let msgContent = "";
    let msgMediaUrl: string | undefined;
    let msgMediaBase64: string | undefined;
    let msgFilename: string | undefined;
    let msgCaption: string | undefined;
    let dbDescription = "";

    if (template) {
      // Template message
      const { data: tpl } = await supabase
        .from("message_templates")
        .select("*")
        .eq("org_id", org.id)
        .eq("name", template)
        .single();

      if (!tpl) {
        return NextResponse.json(
          { error: `Template '${template}' not found. Check your templates in the dashboard.` },
          { status: 404 }
        );
      }

      let content = tpl.body_text;
      if (params && Array.isArray(params)) {
        params.forEach((p: string, i: number) => {
          content = content.replace(`{{${i + 1}}}`, p);
        });
      }
      msgType = "text";
      msgContent = content;
      dbDescription = `Template '${template}' to ${to}`;

    } else if (media_url || media_base64) {
      // Media message
      const ext = media_url?.split(".").pop()?.split("?")[0]?.toLowerCase() || filename?.split(".").pop()?.toLowerCase() || "";
      const autoType = ext === "pdf" || ext === "doc" || ext === "docx" ? "document"
                     : ext === "mp4" || ext === "mov" ? "video"
                     : "image";

      msgType = (media_type as "image" | "document" | "video") || autoType;
      msgContent = caption || "";
      msgMediaUrl = media_url || undefined;
      msgMediaBase64 = media_base64 || undefined;
      msgFilename = filename || undefined;
      msgCaption = caption || undefined;
      dbDescription = `Media (${msgType}) to ${to}`;

    } else {
      // Plain text
      msgType = "text";
      msgContent = message;
      dbDescription = `Text to ${to}`;
    }

    // ── 6. Send ────────────────────────────────────────────────────────────────
    let whatsappMessageId: string | null = null;
    let messageStatus: "sent" | "failed" = "failed";
    let errorMessage: string | null = null;

    try {
      const result = await sendWAMessage(activeSession.id, to, {
        type: msgType,
        content: msgContent,
        mediaUrl: msgMediaUrl,
        mediaBase64: msgMediaBase64,
        filename: msgFilename,
        caption: msgCaption,
      });

      if (result.success) {
        whatsappMessageId = result.messageId || null;
        messageStatus = "sent";

        // Update session daily counter
        await supabase.from("wa_sessions").update({
          messages_sent_today: (activeSession.messages_sent_today || 0) + 1,
          last_message_at: new Date().toISOString(),
        }).eq("id", activeSession.id);
      }
    } catch (e: any) {
      const errMsg: string = e?.message || "Send failed";

      // Number not on WhatsApp — save as failed but do NOT deduct credit
      if (errMsg.startsWith("NOT_ON_WHATSAPP")) {
        const { data: savedMsg } = await supabase.from("messages").insert({
          org_id: org.id,
          to_phone: cleanPhone,
          message_type: msgType,
          content: msgContent?.slice(0, 100) || null,
          status: "failed",
          error_message: `Number ${cleanPhone} is not registered on WhatsApp`,
          wa_session_id: activeSession.id,
        }).select().single();

        return NextResponse.json({
          success: false,
          message_id: savedMsg?.id,
          status: "failed",
          credits_remaining: isUnlimited ? "unlimited" : remaining,
          error: `Number ${cleanPhone} is not registered on WhatsApp`,
        });
      }

      messageStatus = "failed";
      errorMessage = errMsg;
    }

    // ── 7. Save to DB & deduct credit ──────────────────────────────────────────
    const { data: savedMsg } = await supabase.from("messages").insert({
      org_id: org.id,
      to_phone: cleanPhone,
      message_type: msgType,
      content: msgContent?.slice(0, 100) || null,   // trim to save DB space
      media_url: msgMediaUrl || null,
      status: messageStatus,
      whatsapp_message_id: whatsappMessageId,
      error_message: errorMessage,
      wa_session_id: activeSession.id,
      sent_at: messageStatus === "sent" ? new Date().toISOString() : null,
    }).select().single();

    const creditsLeft = await deductCredit(
      supabase, org.id, subscription.id,
      subscription.messages_used, planLimit,
      dbDescription
    );

    // ── 8. Log — minimal, no full content saved ────────────────────────────────
    await supabase.from("api_logs").insert({
      org_id: org.id,
      endpoint: "/api/v1/messages/send",
      method: "POST",
      status_code: messageStatus === "sent" ? 200 : 500,
      request_body: JSON.stringify({ to, type: msgType }),
      response_body: JSON.stringify({ message_id: savedMsg?.id, status: messageStatus }),
    });

    // ── 9. Response ────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: messageStatus === "sent",
      message_id: savedMsg?.id,
      status: messageStatus,
      credits_remaining: isUnlimited ? "unlimited" : creditsLeft,
      ...(errorMessage && { error: errorMessage }),
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

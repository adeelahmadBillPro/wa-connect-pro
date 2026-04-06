import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendWAMessage, isSessionActive } from "@/lib/wa-session-manager";

export const dynamic = "force-dynamic";

// External API endpoint — authenticated via API key (Bearer token)
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

    // Check active subscription
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
        { error: "No active subscription. Please contact admin to activate your plan." },
        { status: 403 }
      );
    }

    // Check message limit
    if (subscription.plan && subscription.messages_used >= subscription.plan.message_limit) {
      return NextResponse.json(
        {
          error: "Monthly message limit reached. Please upgrade your plan.",
          messages_used: subscription.messages_used,
          message_limit: subscription.plan.message_limit,
        },
        { status: 429 }
      );
    }

    // Parse body
    const body = await request.json();
    const { to, message, template, params, media_url, media_type, caption, media_base64, filename } = body;

    if (!to) {
      return NextResponse.json(
        { error: "'to' (phone number) is required" },
        { status: 400 }
      );
    }

    // Plain text message (no template, no media)
    if (message && !template && !media_url) {
      let whatsappMessageId: string | null = null;
      let messageStatus: "queued" | "sent" | "failed" = "queued";
      let errorMessage: string | null = null;
      let usedSessionId: string | null = null;

      // Try wwebjs session first
      const { data: waSessions } = await supabase
        .from("wa_sessions")
        .select("id, daily_limit, messages_sent_today")
        .eq("org_id", org.id)
        .eq("status", "connected")
        .eq("is_active", true);

      const activeSession = waSessions?.find(
        (s) => isSessionActive(s.id) && s.messages_sent_today < s.daily_limit
      );

      if (activeSession) {
        // Send via wwebjs
        try {
          const result = await sendWAMessage(activeSession.id, to, {
            type: "text",
            content: message,
          });
          if (result.success) {
            whatsappMessageId = result.messageId || null;
            messageStatus = "sent";
            usedSessionId = activeSession.id;
            // Update session counter
            await supabase
              .from("wa_sessions")
              .update({
                messages_sent_today: (activeSession.messages_sent_today || 0) + 1,
                last_message_at: new Date().toISOString(),
              })
              .eq("id", activeSession.id);
          } else {
            messageStatus = "failed";
            errorMessage = "wwebjs send failed";
          }
        } catch (e: any) {
          messageStatus = "failed";
          errorMessage = e?.message?.includes("not on WhatsApp")
            ? e.message
            : "Failed to send via WhatsApp Web session";
        }
      } else {
        messageStatus = "failed";
        errorMessage = "No WhatsApp session connected. Please scan QR code first.";
      }

      const { data: msg } = await supabase
        .from("messages")
        .insert({
          org_id: org.id,
          to_phone: to.replace(/[^0-9+]/g, ""),
          message_type: "text",
          content: message,
          status: messageStatus,
          whatsapp_message_id: whatsappMessageId,
          error_message: errorMessage,
          sent_at: messageStatus === "sent" ? new Date().toISOString() : null,
        })
        .select()
        .single();

      const newMessagesUsed = subscription.messages_used + 1;
      const messagesRemaining = (subscription.plan?.message_limit || 0) - newMessagesUsed;
      await supabase.from("organizations").update({ credits: messagesRemaining }).eq("id", org.id);
      await supabase.from("credit_transactions").insert({
        org_id: org.id, amount: 1, type: "usage",
        description: `API: Text to ${to}`, balance_after: messagesRemaining,
      });
      await supabase.from("subscriptions")
        .update({ messages_used: newMessagesUsed })
        .eq("id", subscription.id);

      await supabase.from("api_logs").insert({
        org_id: org.id, endpoint: "/api/v1/messages/send", method: "POST",
        status_code: 200,
        request_body: JSON.stringify({ to, message }),
        response_body: JSON.stringify({ message_id: msg?.id, status: messageStatus }),
      });

      return NextResponse.json({
        success: messageStatus !== "failed",
        message_id: msg?.id,
        status: messageStatus,
        credits_remaining: messagesRemaining,
        ...(errorMessage && { error: errorMessage }),
      });
    }

    // Direct media message (URL or base64, no template needed)
    if ((media_url || media_base64) && !template) {
      let whatsappMessageId: string | null = null;
      let messageStatus: "queued" | "sent" | "failed" = "queued";
      let errorMessage: string | null = null;
      let usedMediaSessionId: string | null = null;

      const msgType = media_type || (media_url.match(/\.(pdf)$/i) ? "document" : "image");

      // Try wwebjs session first for media
      const { data: mediaWaSessions } = await supabase
        .from("wa_sessions")
        .select("id, daily_limit, messages_sent_today")
        .eq("org_id", org.id)
        .eq("status", "connected")
        .eq("is_active", true);

      const activeMediaSession = mediaWaSessions?.find(
        (s) => isSessionActive(s.id) && s.messages_sent_today < s.daily_limit
      );

      if (activeMediaSession) {
        try {
          const result = await sendWAMessage(activeMediaSession.id, to, {
            type: msgType,
            content: caption || "",
            mediaUrl: media_url || undefined,
            mediaBase64: media_base64 || undefined,
            filename: filename || undefined,
            caption: caption,
          });
          if (result.success) {
            whatsappMessageId = result.messageId || null;
            messageStatus = "sent";
            usedMediaSessionId = activeMediaSession.id;
            await supabase
              .from("wa_sessions")
              .update({
                messages_sent_today: (activeMediaSession.messages_sent_today || 0) + 1,
                last_message_at: new Date().toISOString(),
              })
              .eq("id", activeMediaSession.id);
          } else {
            messageStatus = "failed";
            errorMessage = "Failed to send media via WhatsApp Web session";
          }
        } catch (e: any) {
          messageStatus = "failed";
          errorMessage = e?.message?.includes("not on WhatsApp")
            ? e.message
            : "Failed to send media via WhatsApp Web session";
        }
      } else {
        messageStatus = "failed";
        errorMessage = "No WhatsApp session connected. Please scan QR code first.";
      }

      const { data: savedMessage } = await supabase
        .from("messages")
        .insert({
          org_id: org.id,
          to_phone: to.replace(/[^0-9+]/g, ""),
          message_type: msgType,
          content: caption || "",
          media_url,
          status: messageStatus,
          whatsapp_message_id: whatsappMessageId,
          error_message: errorMessage,
          sent_at: messageStatus === "sent" ? new Date().toISOString() : null,
        })
        .select()
        .single();

      // Deduct credit & increment subscription
      const newMediaMessagesUsed = subscription.messages_used + 1;
      const mediaMessagesRemaining = (subscription.plan?.message_limit || 0) - newMediaMessagesUsed;
      await supabase.from("organizations").update({ credits: mediaMessagesRemaining }).eq("id", org.id);
      await supabase.from("credit_transactions").insert({
        org_id: org.id, amount: 1, type: "usage",
        description: `API: Media to ${to}`, balance_after: mediaMessagesRemaining,
      });
      await supabase.from("subscriptions")
        .update({ messages_used: newMediaMessagesUsed })
        .eq("id", subscription.id);

      await supabase.from("api_logs").insert({
        org_id: org.id, endpoint: "/api/v1/messages/send", method: "POST",
        status_code: 200,
        request_body: JSON.stringify({ to, media_url, media_type, caption }),
        response_body: JSON.stringify({ message_id: savedMessage?.id, status: messageStatus }),
      });

      return NextResponse.json({
        success: messageStatus !== "failed",
        message_id: savedMessage?.id,
        status: messageStatus,
        credits_remaining: mediaMessagesRemaining,
        ...(errorMessage && { error: errorMessage }),
      });
    }

    if (!template) {
      return NextResponse.json(
        { error: "Provide 'message' for text, 'media_url' for media, or 'template' for template message" },
        { status: 400 }
      );
    }

    // Find template by name
    const { data: templateData } = await supabase
      .from("message_templates")
      .select("*")
      .eq("org_id", org.id)
      .eq("name", template)
      .single();

    if (!templateData) {
      return NextResponse.json(
        { error: `Template '${template}' not found` },
        { status: 404 }
      );
    }

    // Build content
    let content = templateData.body_text;
    if (params && Array.isArray(params)) {
      params.forEach((param: string, index: number) => {
        content = content.replace(`{{${index + 1}}}`, param);
      });
    }

    // Send via wwebjs session
    let whatsappMessageId: string | null = null;
    let messageStatus: "queued" | "sent" | "failed" = "queued";
    let errorMessage: string | null = null;

    // Find active wwebjs session
    const { data: tplWaSessions } = await supabase
      .from("wa_sessions")
      .select("id, daily_limit, messages_sent_today")
      .eq("org_id", org.id)
      .eq("status", "connected")
      .eq("is_active", true);

    const activeTplSession = tplWaSessions?.find(
      (s) => isSessionActive(s.id) && s.messages_sent_today < s.daily_limit
    );

    if (activeTplSession) {
      try {
        const result = await sendWAMessage(activeTplSession.id, to, {
          type: "text",
          content: content,
        });
        if (result.success) {
          whatsappMessageId = result.messageId || null;
          messageStatus = "sent";
          await supabase
            .from("wa_sessions")
            .update({
              messages_sent_today: (activeTplSession.messages_sent_today || 0) + 1,
              last_message_at: new Date().toISOString(),
            })
            .eq("id", activeTplSession.id);
        } else {
          messageStatus = "failed";
          errorMessage = "Failed to send template via WhatsApp Web session";
        }
      } catch {
        messageStatus = "failed";
        errorMessage = "Failed to send template via WhatsApp Web session";
      }
    } else {
      messageStatus = "failed";
      errorMessage = "No WhatsApp session connected. Please scan QR code first.";
    }

    // Save message
    const { data: savedMsg } = await supabase
      .from("messages")
      .insert({
        org_id: org.id,
        to_phone: to.replace(/[^0-9+]/g, ""),
        template_id: templateData.id,
        message_type: "template",
        content,
        media_url: templateData.header_media_url || null,
        status: messageStatus,
        whatsapp_message_id: whatsappMessageId,
        error_message: errorMessage,
        sent_at: messageStatus === "sent" ? new Date().toISOString() : null,
      })
      .select()
      .single();

    // Deduct credit
    const newTplMessagesUsed = subscription.messages_used + 1;
    const tplMessagesRemaining = (subscription.plan?.message_limit || 0) - newTplMessagesUsed;
    await supabase
      .from("organizations")
      .update({ credits: tplMessagesRemaining })
      .eq("id", org.id);

    await supabase.from("credit_transactions").insert({
      org_id: org.id,
      amount: 1,
      type: "usage",
      description: `API: Message to ${to}`,
      balance_after: tplMessagesRemaining,
    });

    // Increment subscription messages_used
    await supabase
      .from("subscriptions")
      .update({ messages_used: newTplMessagesUsed })
      .eq("id", subscription.id);

    // Log API call
    await supabase.from("api_logs").insert({
      org_id: org.id,
      endpoint: "/api/v1/messages/send",
      method: "POST",
      status_code: 200,
      request_body: JSON.stringify({ to, template, params }),
      response_body: JSON.stringify({
        message_id: savedMsg?.id,
        status: messageStatus,
      }),
    });

    return NextResponse.json({
      success: messageStatus !== "failed",
      message_id: savedMsg?.id,
      status: messageStatus,
      credits_remaining: tplMessagesRemaining,
      ...(errorMessage && { error: errorMessage }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

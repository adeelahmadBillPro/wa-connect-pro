import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

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
    const { to, message, template, params, media_url, media_type, caption } = body;

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

      if (org.whatsapp_connected && org.whatsapp_access_token && org.whatsapp_phone_number_id) {
        try {
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
                to: to.replace(/[^0-9]/g, ""),
                type: "text",
                text: { body: message },
              }),
            }
          );

          const waResult = await waResponse.json();
          if (waResponse.ok && waResult.messages?.[0]?.id) {
            whatsappMessageId = waResult.messages[0].id;
            messageStatus = "sent";
          } else {
            messageStatus = "failed";
            errorMessage = waResult.error?.message || "WhatsApp API error";
          }
        } catch {
          messageStatus = "failed";
          errorMessage = "Failed to connect to WhatsApp API";
        }
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

      const newBalance = org.credits - 1;
      await supabase.from("organizations").update({ credits: newBalance }).eq("id", org.id);
      await supabase.from("credit_transactions").insert({
        org_id: org.id, amount: 1, type: "usage",
        description: `API: Text to ${to}`, balance_after: newBalance,
      });
      await supabase.from("subscriptions")
        .update({ messages_used: subscription.messages_used + 1 })
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
        credits_remaining: newBalance,
        ...(errorMessage && { error: errorMessage }),
      });
    }

    // Direct media message (no template needed)
    if (media_url && !template) {
      let whatsappMessageId: string | null = null;
      let messageStatus: "queued" | "sent" | "failed" = "queued";
      let errorMessage: string | null = null;

      const msgType = media_type || (media_url.match(/\.(pdf)$/i) ? "document" : "image");

      if (org.whatsapp_connected && org.whatsapp_access_token && org.whatsapp_phone_number_id) {
        try {
          const mediaPayload: Record<string, unknown> = {
            messaging_product: "whatsapp",
            to: to.replace(/[^0-9]/g, ""),
            type: msgType,
          };

          if (msgType === "image") {
            mediaPayload.image = { link: media_url, ...(caption && { caption }) };
          } else if (msgType === "document") {
            mediaPayload.document = {
              link: media_url,
              ...(caption && { caption }),
              filename: media_url.split("/").pop() || "document.pdf",
            };
          } else if (msgType === "video") {
            mediaPayload.video = { link: media_url, ...(caption && { caption }) };
          }

          const waResponse = await fetch(
            `https://graph.facebook.com/v21.0/${org.whatsapp_phone_number_id}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${org.whatsapp_access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(mediaPayload),
            }
          );

          const waResult = await waResponse.json();
          if (waResponse.ok && waResult.messages?.[0]?.id) {
            whatsappMessageId = waResult.messages[0].id;
            messageStatus = "sent";
          } else {
            messageStatus = "failed";
            errorMessage = waResult.error?.message || "WhatsApp API error";
          }
        } catch {
          messageStatus = "failed";
          errorMessage = "Failed to connect to WhatsApp API";
        }
      }

      const { data: message } = await supabase
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
      const newBalance = org.credits - 1;
      await supabase.from("organizations").update({ credits: newBalance }).eq("id", org.id);
      await supabase.from("credit_transactions").insert({
        org_id: org.id, amount: 1, type: "usage",
        description: `API: Media to ${to}`, balance_after: newBalance,
      });
      await supabase.from("subscriptions")
        .update({ messages_used: subscription.messages_used + 1 })
        .eq("id", subscription.id);

      await supabase.from("api_logs").insert({
        org_id: org.id, endpoint: "/api/v1/messages/send", method: "POST",
        status_code: 200,
        request_body: JSON.stringify({ to, media_url, media_type, caption }),
        response_body: JSON.stringify({ message_id: message?.id, status: messageStatus }),
      });

      return NextResponse.json({
        success: messageStatus !== "failed",
        message_id: message?.id,
        status: messageStatus,
        credits_remaining: newBalance,
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

    // Send via WhatsApp API if connected
    let whatsappMessageId: string | null = null;
    let messageStatus: "queued" | "sent" | "failed" = "queued";
    let errorMessage: string | null = null;

    if (
      org.whatsapp_connected &&
      org.whatsapp_access_token &&
      org.whatsapp_phone_number_id
    ) {
      try {
        // Use the language code as stored (must match Meta template exactly)
        const metaLang = templateData.language;

        // Build template components
        const components: Record<string, unknown>[] = [];

        // Add header component if template has media
        if (templateData.header_type === "image" && templateData.header_media_url) {
          components.push({
            type: "header",
            parameters: [{ type: "image", image: { link: templateData.header_media_url } }],
          });
        } else if (templateData.header_type === "document" && templateData.header_media_url) {
          components.push({
            type: "header",
            parameters: [{ type: "document", document: { link: templateData.header_media_url } }],
          });
        } else if (templateData.header_type === "video" && templateData.header_media_url) {
          components.push({
            type: "header",
            parameters: [{ type: "video", video: { link: templateData.header_media_url } }],
          });
        }

        // Add body parameters
        if (params && params.length > 0) {
          components.push({
            type: "body",
            parameters: params.map((p: string) => ({ type: "text", text: p })),
          });
        }

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
              to: to.replace(/[^0-9]/g, ""),
              type: "template",
              template: {
                name: templateData.name,
                language: { code: metaLang },
                components: components.length > 0 ? components : undefined,
              },
            }),
          }
        );

        const waResult = await waResponse.json();

        if (waResponse.ok && waResult.messages?.[0]?.id) {
          whatsappMessageId = waResult.messages[0].id;
          messageStatus = "sent";
        } else {
          messageStatus = "failed";
          errorMessage = waResult.error?.error_data?.details || waResult.error?.message || "WhatsApp API error";
        }
      } catch {
        messageStatus = "failed";
        errorMessage = "Failed to connect to WhatsApp API";
      }
    }

    // Save message
    const { data: message } = await supabase
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
    const newBalance = org.credits - 1;
    await supabase
      .from("organizations")
      .update({ credits: newBalance })
      .eq("id", org.id);

    await supabase.from("credit_transactions").insert({
      org_id: org.id,
      amount: 1,
      type: "usage",
      description: `API: Message to ${to}`,
      balance_after: newBalance,
    });

    // Increment subscription messages_used
    await supabase
      .from("subscriptions")
      .update({ messages_used: subscription.messages_used + 1 })
      .eq("id", subscription.id);

    // Log API call
    await supabase.from("api_logs").insert({
      org_id: org.id,
      endpoint: "/api/v1/messages/send",
      method: "POST",
      status_code: 200,
      request_body: JSON.stringify({ to, template, params }),
      response_body: JSON.stringify({
        message_id: message?.id,
        status: messageStatus,
      }),
    });

    return NextResponse.json({
      success: messageStatus !== "failed",
      message_id: message?.id,
      status: messageStatus,
      credits_remaining: newBalance,
      ...(errorMessage && { error: errorMessage }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

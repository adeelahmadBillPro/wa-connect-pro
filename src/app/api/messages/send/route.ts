import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Get user's organization
    const { data: member } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    if (!member) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 400 }
      );
    }

    // Get organization details
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", member.org_id)
      .single();
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 400 }
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

    if (subscription.plan && subscription.messages_used >= subscription.plan.message_limit) {
      return NextResponse.json(
        { error: "Monthly message limit reached. Please upgrade your plan." },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { to_phone, template_id, params } = body;

    if (!to_phone || !template_id) {
      return NextResponse.json(
        { error: "to_phone and template_id are required" },
        { status: 400 }
      );
    }

    // Get template
    const { data: template } = await supabase
      .from("message_templates")
      .select("*")
      .eq("id", template_id)
      .eq("org_id", org.id)
      .single();
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Build message content by replacing placeholders
    let content = template.body_text;
    if (params && Array.isArray(params)) {
      params.forEach((param: string, index: number) => {
        content = content.replace(`{{${index + 1}}}`, param);
      });
    }

    // Send via WhatsApp Meta Cloud API (if connected)
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
        const metaLang = template.language;

        // Build template components
        const components: Record<string, unknown>[] = [];

        // Add header component if template has media
        if (template.header_type === "image" && template.header_media_url) {
          components.push({
            type: "header",
            parameters: [{ type: "image", image: { link: template.header_media_url } }],
          });
        } else if (template.header_type === "document" && template.header_media_url) {
          components.push({
            type: "header",
            parameters: [{ type: "document", document: { link: template.header_media_url } }],
          });
        } else if (template.header_type === "video" && template.header_media_url) {
          components.push({
            type: "header",
            parameters: [{ type: "video", video: { link: template.header_media_url } }],
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
              to: to_phone.replace(/[^0-9]/g, ""),
              type: "template",
              template: {
                name: template.name,
                language: { code: metaLang },
                components: components.length > 0 ? components : undefined,
              },
            }),
          }
        );

        const waResult = await waResponse.json();
        console.log("WhatsApp API response:", JSON.stringify(waResult, null, 2));

        if (waResponse.ok && waResult.messages?.[0]?.id) {
          whatsappMessageId = waResult.messages[0].id;
          messageStatus = "sent";
        } else {
          messageStatus = "failed";
          errorMessage =
            waResult.error?.error_data?.details ||
            waResult.error?.message ||
            JSON.stringify(waResult);
        }
      } catch (err) {
        messageStatus = "failed";
        errorMessage = "Failed to connect to WhatsApp API";
      }
    }

    // Save message to database
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        org_id: org.id,
        to_phone: to_phone.replace(/[^0-9+]/g, ""),
        template_id,
        message_type: "template",
        content,
        status: messageStatus,
        whatsapp_message_id: whatsappMessageId,
        error_message: errorMessage,
        sent_at: messageStatus === "sent" ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (msgError) {
      return NextResponse.json(
        { error: "Failed to save message" },
        { status: 500 }
      );
    }

    // Deduct credit
    await supabase
      .from("organizations")
      .update({ credits: org.credits - 1 })
      .eq("id", org.id);

    // Increment subscription messages_used
    await supabase
      .from("subscriptions")
      .update({ messages_used: subscription.messages_used + 1 })
      .eq("id", subscription.id);

    // Log credit transaction
    await supabase.from("credit_transactions").insert({
      org_id: org.id,
      amount: 1,
      type: "usage",
      description: `Message to ${to_phone}`,
      balance_after: org.credits - 1,
    });

    return NextResponse.json({
      success: messageStatus !== "failed",
      message_id: message.id,
      status: messageStatus,
      credits_remaining: org.credits - 1,
      ...(errorMessage && { error: errorMessage }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

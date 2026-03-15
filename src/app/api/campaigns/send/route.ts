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

    const body = await request.json();
    const { campaign_id } = body;

    if (!campaign_id) {
      return NextResponse.json(
        { error: "campaign_id is required" },
        { status: 400 }
      );
    }

    // Get campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*, template:message_templates(*)")
      .eq("id", campaign_id)
      .eq("org_id", member.org_id)
      .single();

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: "Campaign has already been sent" },
        { status: 400 }
      );
    }

    // Get organization
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

    // Get contacts (from group or all contacts)
    let contactsQuery = supabase
      .from("contacts")
      .select("*")
      .eq("org_id", org.id);

    if (campaign.group_id) {
      contactsQuery = contactsQuery.eq("group_id", campaign.group_id);
    }

    const { data: contacts } = await contactsQuery;

    if (!contacts || contacts.length === 0) {
      return NextResponse.json(
        { error: "No contacts found for this campaign" },
        { status: 400 }
      );
    }

    // Check credits
    if (org.credits < contacts.length) {
      return NextResponse.json(
        {
          error: `Insufficient credits. Need ${contacts.length}, have ${org.credits}.`,
        },
        { status: 402 }
      );
    }

    // Update campaign status to sending
    await supabase
      .from("campaigns")
      .update({
        status: "sending",
        total_messages: contacts.length,
      })
      .eq("id", campaign_id);

    // Create message records for all contacts
    const messageRecords = contacts.map((contact) => {
      let content = campaign.template?.body_text || "";
      // Replace {{1}} with contact name as default
      content = content.replace("{{1}}", contact.name);

      return {
        org_id: org.id,
        campaign_id,
        contact_id: contact.id,
        template_id: campaign.template_id,
        to_phone: contact.phone,
        message_type: "template" as const,
        content,
        status: "queued" as const,
      };
    });

    const { error: insertError } = await supabase
      .from("messages")
      .insert(messageRecords);

    if (insertError) {
      await supabase
        .from("campaigns")
        .update({ status: "failed" })
        .eq("id", campaign_id);
      return NextResponse.json(
        { error: "Failed to create messages" },
        { status: 500 }
      );
    }

    // Send messages via WhatsApp API (if connected)
    let sentCount = 0;
    let failedCount = 0;

    if (
      org.whatsapp_connected &&
      org.whatsapp_access_token &&
      org.whatsapp_phone_number_id
    ) {
      for (const contact of contacts) {
        try {
          // Build template components
          const tmplComponents: Record<string, unknown>[] = [];

          // Add header component if template has media
          const tmpl = campaign.template;
          if (tmpl?.header_type === "image" && tmpl?.header_media_url) {
            tmplComponents.push({
              type: "header",
              parameters: [{ type: "image", image: { link: tmpl.header_media_url } }],
            });
          } else if (tmpl?.header_type === "document" && tmpl?.header_media_url) {
            tmplComponents.push({
              type: "header",
              parameters: [{ type: "document", document: { link: tmpl.header_media_url } }],
            });
          } else if (tmpl?.header_type === "video" && tmpl?.header_media_url) {
            tmplComponents.push({
              type: "header",
              parameters: [{ type: "video", video: { link: tmpl.header_media_url } }],
            });
          }

          // Add body parameters
          tmplComponents.push({
            type: "body",
            parameters: [{ type: "text", text: contact.name }],
          });

          // Use the language code as stored (must match Meta template exactly)
          const metaLang = campaign.template?.language || "en";

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
                to: contact.phone.replace(/[^0-9]/g, ""),
                type: "template",
                template: {
                  name: campaign.template?.name,
                  language: { code: metaLang },
                  components: tmplComponents,
                },
              }),
            }
          );

          const waResult = await waResponse.json();

          if (waResponse.ok && waResult.messages?.[0]?.id) {
            sentCount++;
            await supabase
              .from("messages")
              .update({
                status: "sent",
                whatsapp_message_id: waResult.messages[0].id,
                sent_at: new Date().toISOString(),
              })
              .eq("campaign_id", campaign_id)
              .eq("contact_id", contact.id);
          } else {
            failedCount++;
            await supabase
              .from("messages")
              .update({
                status: "failed",
                error_message:
                  waResult.error?.message || "WhatsApp API error",
              })
              .eq("campaign_id", campaign_id)
              .eq("contact_id", contact.id);
          }
        } catch {
          failedCount++;
          await supabase
            .from("messages")
            .update({
              status: "failed",
              error_message: "Failed to connect to WhatsApp API",
            })
            .eq("campaign_id", campaign_id)
            .eq("contact_id", contact.id);
        }
      }
    } else {
      // No WhatsApp connected — messages stay as "queued"
      sentCount = contacts.length;
    }

    // Update campaign status
    await supabase
      .from("campaigns")
      .update({
        status: "completed",
        sent_count: sentCount,
        failed_count: failedCount,
      })
      .eq("id", campaign_id);

    // Deduct credits
    const creditsUsed = contacts.length;
    const newBalance = org.credits - creditsUsed;
    await supabase
      .from("organizations")
      .update({ credits: newBalance })
      .eq("id", org.id);

    // Log credit transaction
    await supabase.from("credit_transactions").insert({
      org_id: org.id,
      amount: creditsUsed,
      type: "usage",
      description: `Campaign: ${campaign.name} (${contacts.length} messages)`,
      balance_after: newBalance,
    });

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      total: contacts.length,
      credits_remaining: newBalance,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

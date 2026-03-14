import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// WhatsApp webhook verification (GET) — Meta sends this to verify your endpoint
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Verify token must match what you set in Meta Developer Console
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "wa_connect_pro_verify";

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// WhatsApp webhook events (POST) — receives delivery status updates
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createServiceClient();

    // Process each entry
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== "messages") continue;

        const value = change.value;

        // Handle message status updates (sent → delivered → read)
        const statuses = value.statuses || [];
        for (const status of statuses) {
          const waMessageId = status.id;
          const newStatus = status.status; // sent, delivered, read, failed

          if (!waMessageId || !newStatus) continue;

          const updateData: Record<string, string> = {
            status: newStatus,
          };

          if (newStatus === "delivered") {
            updateData.delivered_at = new Date().toISOString();
          } else if (newStatus === "read") {
            updateData.read_at = new Date().toISOString();
          } else if (newStatus === "failed") {
            updateData.error_message =
              status.errors?.[0]?.title || "Delivery failed";
          }

          // Update message in database
          await supabase
            .from("messages")
            .update(updateData)
            .eq("whatsapp_message_id", waMessageId);

          // Get message with org details for webhook callback
          const { data: message } = await supabase
            .from("messages")
            .select("id, campaign_id, org_id, to_phone")
            .eq("whatsapp_message_id", waMessageId)
            .single();

          // Send webhook callback to 3rd party if configured
          if (message?.org_id) {
            const { data: org } = await supabase
              .from("organizations")
              .select("webhook_url")
              .eq("id", message.org_id)
              .single();

            if (org?.webhook_url) {
              try {
                await fetch(org.webhook_url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    event: "message.status_update",
                    message_id: message.id,
                    to_phone: message.to_phone,
                    status: newStatus,
                    timestamp: new Date().toISOString(),
                    ...(newStatus === "failed" && {
                      error: status.errors?.[0]?.title,
                    }),
                  }),
                });
              } catch {
                // Ignore callback errors
              }
            }
          }

          if (message?.campaign_id) {
            if (newStatus === "delivered") {
              await supabase.rpc("increment_campaign_count", {
                p_campaign_id: message.campaign_id,
                p_field: "delivered_count",
              });
            } else if (newStatus === "read") {
              await supabase.rpc("increment_campaign_count", {
                p_campaign_id: message.campaign_id,
                p_field: "read_count",
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    // Always return 200 to Meta — otherwise they'll retry
    return NextResponse.json({ success: true }, { status: 200 });
  }
}

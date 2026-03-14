import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// External API — Queue bulk messages via WhatsApp Web (with rate limiting)
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "").trim();
    const supabase = createServiceClient();

    // Verify API key
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("api_key", apiKey)
      .single();

    if (!org) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const body = await request.json();
    const { messages } = body;
    // messages: [{ to, message, patient_name?, type?, media_url?, caption? }]

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "'messages' array is required. Each item needs 'to' and 'message'." },
        { status: 400 }
      );
    }

    // Check active sessions
    const { data: sessions } = await supabase
      .from("wa_sessions")
      .select("id, daily_limit, messages_sent_today")
      .eq("org_id", org.id)
      .eq("status", "connected")
      .eq("is_active", true);

    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        { error: "No active WhatsApp Web session." },
        { status: 400 }
      );
    }

    // Check capacity
    const totalCapacity = sessions.reduce(
      (sum, s) => sum + (s.daily_limit - s.messages_sent_today),
      0
    );

    if (totalCapacity < messages.length) {
      return NextResponse.json(
        {
          error: `Not enough daily capacity. Need ${messages.length}, available ${totalCapacity}.`,
          available_capacity: totalCapacity,
        },
        { status: 429 }
      );
    }

    // Queue messages with round-robin session assignment
    let sessionIndex = 0;
    const queueRecords = messages.map(
      (msg: {
        to: string;
        message: string;
        patient_name?: string;
        type?: string;
        media_url?: string;
        caption?: string;
      }) => {
        const assignedSession = sessions[sessionIndex % sessions.length];
        sessionIndex++;

        // Personalize
        let content = msg.message || msg.caption || "";
        if (msg.patient_name) {
          content = content.replace(/\{\{name\}\}/g, msg.patient_name);
          content = content.replace(/\{\{1\}\}/g, msg.patient_name);
        }

        return {
          org_id: org.id,
          session_id: assignedSession.id,
          to_phone: msg.to.replace(/[^0-9+]/g, ""),
          message_type: msg.type || (msg.media_url ? "image" : "text"),
          content,
          media_url: msg.media_url || null,
          caption: msg.caption || null,
          status: "pending" as const,
        };
      }
    );

    const { data: queued, error } = await supabase
      .from("wa_message_queue")
      .insert(queueRecords)
      .select("id");

    if (error) {
      return NextResponse.json(
        { error: "Failed to queue messages" },
        { status: 500 }
      );
    }

    // Log API call
    await supabase.from("api_logs").insert({
      org_id: org.id,
      endpoint: "/api/v1/wa/bulk",
      method: "POST",
      status_code: 200,
      request_body: JSON.stringify({ count: messages.length }),
      response_body: JSON.stringify({ queued: queued?.length }),
    });

    // Fire-and-forget webhook callback if org has a webhook_url
    if (org.webhook_url) {
      try {
        const webhookPayload = {
          event: "messages.queued",
          count: queued?.length || 0,
          total_requested: messages.length,
          status: "queued",
          timestamp: new Date().toISOString(),
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

    return NextResponse.json({
      success: true,
      queued: queued?.length || 0,
      total: messages.length,
      message: `${messages.length} messages queued. They will be sent with safe delays (5-15 sec each).`,
      estimated_time: `~${Math.ceil((messages.length * 10) / 60)} minutes`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

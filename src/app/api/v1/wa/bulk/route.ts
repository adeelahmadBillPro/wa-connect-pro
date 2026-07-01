import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withRateLimitHeaders } from "@/lib/rate-limit-headers";

export const dynamic = "force-dynamic";

// External API — Queue bulk messages via WhatsApp Web (with auto rate limiting)
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing Authorization header. Use: Bearer your_api_key" },
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

    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "'messages' array is required. Each item needs 'to' and 'message'." },
        { status: 400 }
      );
    }

    // Check subscription message limit
    if (
      subscription.plan &&
      subscription.messages_used + messages.length > subscription.plan.message_limit
    ) {
      const remaining = Math.max(0, subscription.plan.message_limit - subscription.messages_used);
      return NextResponse.json(
        {
          error: `Not enough messages in your plan. Need ${messages.length}, remaining ${remaining}. Please upgrade.`,
          remaining,
        },
        { status: 429 }
      );
    }

    // Find connected WA sessions for this org. Trust DB status; subscription
    // monthly quota (checked upstream) is the business gate; sendWAMessage
    // in the queue processor is the actual liveness check when it runs.
    const { data: sessions } = await supabase
      .from("wa_sessions")
      .select("id, daily_limit, messages_sent_today")
      .eq("org_id", org.id)
      .eq("status", "connected");

    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        { error: "No active WhatsApp session. Please scan QR code first." },
        { status: 400 }
      );
    }

    // Bulk fills the queue — subscription quota already vetted above (this
    // route checks messages_used vs message_limit). No per-session daily gate.
    const activeSessions = sessions;

    // Queue messages — round-robin across active sessions
    let sessionIndex = 0;
    const queueRecords = messages.map(
      (msg: {
        to: string;
        message?: string;
        media_url?: string;
        media_type?: string;
        caption?: string;
        name?: string;       // personalization: replaces {{name}} in message
        urgent?: boolean;    // bypasses business-hours gate in queue worker
      }) => {
        const assignedSession = activeSessions[sessionIndex % activeSessions.length];
        sessionIndex++;

        // Personalize message — replace {{name}} with actual name
        let content = msg.message || msg.caption || "";
        if (msg.name) {
          content = content.replace(/\{\{name\}\}/gi, msg.name);
          content = content.replace(/\{\{1\}\}/g, msg.name);
        }

        const msgType = msg.media_type || (msg.media_url ? "image" : "text");

        return {
          org_id: org.id,
          session_id: assignedSession.id,
          to_phone: msg.to.replace(/[^0-9+]/g, ""),
          message_type: msgType,
          content,
          media_url: msg.media_url || null,
          caption: msg.caption || null,
          status: "pending" as const,
          urgent: msg.urgent === true,
        };
      }
    );

    const { data: queued, error: queueError } = await supabase
      .from("wa_message_queue")
      .insert(queueRecords)
      .select("id");

    if (queueError) {
      return NextResponse.json(
        { error: "Failed to queue messages" },
        { status: 500 }
      );
    }

    // Increment subscription usage
    await supabase
      .from("subscriptions")
      .update({ messages_used: subscription.messages_used + messages.length })
      .eq("id", subscription.id);

    // Log API call
    await supabase.from("api_logs").insert({
      org_id: org.id,
      endpoint: "/api/v1/wa/bulk",
      method: "POST",
      status_code: 200,
      request_body: JSON.stringify({ count: messages.length }),
      response_body: JSON.stringify({ queued: queued?.length }),
    });

    const estimatedMinutes = Math.ceil((messages.length * 10) / 60);

    return await withRateLimitHeaders(supabase, org.id, NextResponse.json({
      success: true,
      queued: queued?.length || 0,
      total: messages.length,
      estimated_minutes: estimatedMinutes,
      message: `${messages.length} messages queued. Sending with safe delays (~${estimatedMinutes} min).`,
    }));
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

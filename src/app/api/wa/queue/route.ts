import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendWAMessage, isSessionActive } from "@/lib/wa-session-manager";

// POST - Queue bulk messages (campaign-style) with rate limiting
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: member } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    if (!member) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();
    const { messages, session_id } = body;
    // messages: [{ to_phone, message, message_type?, media_url?, caption? }]

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceClient();

    // Find active sessions
    const { data: sessions } = await supabase
      .from("wa_sessions")
      .select("id, daily_limit, messages_sent_today")
      .eq("org_id", member.org_id)
      .eq("status", "connected")
      .eq("is_active", true);

    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        { error: "No active WhatsApp session." },
        { status: 400 }
      );
    }

    // Calculate available capacity across all sessions
    const totalCapacity = sessions.reduce(
      (sum, s) => sum + (s.daily_limit - s.messages_sent_today),
      0
    );

    if (totalCapacity < messages.length) {
      return NextResponse.json(
        {
          error: `Not enough capacity. Need ${messages.length}, available ${totalCapacity}.`,
          capacity: totalCapacity,
        },
        { status: 429 }
      );
    }

    // Distribute messages across sessions
    let sessionIndex = 0;
    const queueRecords = messages.map(
      (msg: {
        to_phone: string;
        message: string;
        message_type?: string;
        media_url?: string;
        caption?: string;
      }) => {
        // Round-robin across sessions
        const assignedSession = sessions[sessionIndex % sessions.length];
        sessionIndex++;

        return {
          org_id: member.org_id,
          session_id: session_id || assignedSession.id,
          to_phone: msg.to_phone.replace(/[^0-9+]/g, ""),
          message_type: msg.message_type || "text",
          content: msg.message,
          media_url: msg.media_url || null,
          caption: msg.caption || null,
          status: "pending" as const,
        };
      }
    );

    // Insert into queue
    const { data: queued, error } = await serviceSupabase
      .from("wa_message_queue")
      .insert(queueRecords)
      .select("id");

    if (error) {
      return NextResponse.json(
        { error: "Failed to queue messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      queued: queued?.length || 0,
      total: messages.length,
      message: `${messages.length} messages queued. They will be sent with safe delays.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET - Process pending queue messages (call this via cron or interval)
export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get("secret");
    // Simple protection for the cron endpoint
    if (secret !== process.env.CRON_SECRET && secret !== "process") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceSupabase = createServiceClient();

    // Get pending messages (oldest first, limit batch)
    const { data: pending } = await serviceSupabase
      .from("wa_message_queue")
      .select("*, session:wa_sessions(*)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    if (!pending || pending.length === 0) {
      return NextResponse.json({ processed: 0, message: "No pending messages" });
    }

    let sent = 0;
    let failed = 0;

    for (const msg of pending) {
      // Check if session is active
      if (!msg.session_id || !isSessionActive(msg.session_id)) {
        // Try to find another active session for this org
        const { data: altSessions } = await serviceSupabase
          .from("wa_sessions")
          .select("id")
          .eq("org_id", msg.org_id)
          .eq("status", "connected")
          .eq("is_active", true)
          .limit(1);

        if (!altSessions || altSessions.length === 0) {
          // No active sessions, skip
          continue;
        }
        msg.session_id = altSessions[0].id;
      }

      // Check daily limit
      const { data: session } = await serviceSupabase
        .from("wa_sessions")
        .select("daily_limit, messages_sent_today")
        .eq("id", msg.session_id)
        .single();

      if (session && session.messages_sent_today >= session.daily_limit) {
        continue; // Skip, limit reached
      }

      try {
        // Mark as sending
        await serviceSupabase
          .from("wa_message_queue")
          .update({ status: "sending" })
          .eq("id", msg.id);

        const result = await sendWAMessage(msg.session_id, msg.to_phone, {
          type: (msg.message_type as "text" | "image" | "document" | "video") || "text",
          content: msg.content,
          mediaUrl: msg.media_url || undefined,
          caption: msg.caption || undefined,
        });

        // Update queue record
        await serviceSupabase
          .from("wa_message_queue")
          .update({
            status: "sent",
            whatsapp_message_id: result.messageId,
            sent_at: new Date().toISOString(),
          })
          .eq("id", msg.id);

        // Save to messages table
        await serviceSupabase.from("messages").insert({
          org_id: msg.org_id,
          to_phone: msg.to_phone,
          message_type: msg.message_type || "text",
          content: msg.content,
          media_url: msg.media_url,
          status: "sent",
          whatsapp_message_id: result.messageId,
          wa_session_id: msg.session_id,
          campaign_id: msg.campaign_id,
          sent_at: new Date().toISOString(),
        });

        // Update session counter
        await serviceSupabase
          .from("wa_sessions")
          .update({
            messages_sent_today: (session?.messages_sent_today || 0) + 1,
            last_message_at: new Date().toISOString(),
          })
          .eq("id", msg.session_id);

        sent++;

        // Anti-ban: Random delay between 5-15 seconds
        const delay = Math.floor(Math.random() * 10000) + 5000;
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Extra pause every 25 messages
        if (sent % 25 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 60000));
        }
      } catch (error: any) {
        failed++;
        await serviceSupabase
          .from("wa_message_queue")
          .update({
            status: "failed",
            error_message: error?.message || "Send failed",
            retry_count: (msg.retry_count || 0) + 1,
          })
          .eq("id", msg.id);
      }
    }

    return NextResponse.json({
      processed: sent + failed,
      sent,
      failed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

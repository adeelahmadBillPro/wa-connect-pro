import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { sendWAMessage, isSessionActive } from "@/lib/wa-session-manager";

export const dynamic = "force-dynamic";

// POST - Send a message via WhatsApp Web session
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: member } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    if (!member) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();
    const { to_phone, message, message_type, media_url, caption, session_id } =
      body;

    if (!to_phone || !message) {
      return NextResponse.json(
        { error: "to_phone and message are required" },
        { status: 400 }
      );
    }

    // Find an active session
    let activeSessionId = session_id;

    if (!activeSessionId) {
      // Find first active session for this org
      const { data: sessions } = await supabase
        .from("wa_sessions")
        .select("id, daily_limit, messages_sent_today")
        .eq("org_id", member.org_id)
        .eq("status", "connected")
        .eq("is_active", true);

      if (!sessions || sessions.length === 0) {
        return NextResponse.json(
          { error: "No active WhatsApp session. Please scan QR code first." },
          { status: 400 }
        );
      }

      // Find session with remaining daily limit
      const available = sessions.find(
        (s) => s.messages_sent_today < s.daily_limit
      );
      if (!available) {
        return NextResponse.json(
          { error: "Daily message limit reached for all sessions." },
          { status: 429 }
        );
      }
      activeSessionId = available.id;
    }

    // Verify session is connected in memory
    if (!isSessionActive(activeSessionId)) {
      return NextResponse.json(
        { error: "Session is not connected. Please reconnect." },
        { status: 400 }
      );
    }

    // Send the message
    const result = await sendWAMessage(activeSessionId, to_phone, {
      type: message_type || "text",
      content: message,
      mediaUrl: media_url,
      caption,
    });

    // Save to messages table
    const { data: savedMessage } = await supabase
      .from("messages")
      .insert({
        org_id: member.org_id,
        to_phone: to_phone.replace(/[^0-9+]/g, ""),
        message_type: message_type || "text",
        content: message,
        media_url: media_url || null,
        status: result.success ? "sent" : "failed",
        whatsapp_message_id: result.messageId,
        wa_session_id: activeSessionId,
        sent_at: result.success ? new Date().toISOString() : null,
      })
      .select()
      .single();

    // Update session counter
    const { data: currentSession } = await supabase
      .from("wa_sessions")
      .select("messages_sent_today")
      .eq("id", activeSessionId)
      .single();

    await supabase
      .from("wa_sessions")
      .update({
        messages_sent_today: (currentSession?.messages_sent_today || 0) + 1,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", activeSessionId);

    return NextResponse.json({
      success: true,
      message_id: savedMessage?.id,
      whatsapp_message_id: result.messageId,
      session_id: activeSessionId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to send message" },
      { status: 500 }
    );
  }
}

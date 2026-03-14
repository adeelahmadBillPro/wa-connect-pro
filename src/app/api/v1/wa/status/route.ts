import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// GET /api/v1/wa/status — Check WhatsApp session status
export async function GET(request: NextRequest) {
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

    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("api_key", apiKey)
      .single();

    if (!org) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const { data: sessions } = await supabase
      .from("wa_sessions")
      .select("id, session_name, phone_number, status, is_active, daily_limit, messages_sent_today, last_message_at, last_connected_at")
      .eq("org_id", org.id);

    const connected = (sessions || []).filter(s => s.status === "connected" && s.is_active);
    const totalCapacity = connected.reduce((sum, s) => sum + (s.daily_limit - s.messages_sent_today), 0);

    return NextResponse.json({
      success: true,
      connected_sessions: connected.length,
      total_sessions: sessions?.length || 0,
      daily_capacity_remaining: totalCapacity,
      sessions: (sessions || []).map(s => ({
        id: s.id,
        name: s.session_name,
        phone: s.phone_number,
        status: s.status,
        is_active: s.is_active,
        daily_limit: s.daily_limit,
        messages_sent_today: s.messages_sent_today,
        last_message_at: s.last_message_at,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

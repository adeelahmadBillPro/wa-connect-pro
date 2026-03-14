import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// GET /api/v1/wa/messages — Get message history
// Query params: ?limit=50&status=sent&phone=923001234567
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

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const status = url.searchParams.get("status");
    const phone = url.searchParams.get("phone");
    const messageId = url.searchParams.get("message_id");

    let query = supabase
      .from("messages")
      .select("id, to_phone, message_type, content, status, whatsapp_message_id, sent_at, delivered_at, read_at, created_at")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);
    if (phone) query = query.eq("to_phone", phone.replace(/[^0-9+]/g, ""));
    if (messageId) query = query.eq("id", messageId);

    const { data: messages, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: messages?.length || 0,
      messages: messages || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

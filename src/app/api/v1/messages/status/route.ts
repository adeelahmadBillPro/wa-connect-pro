import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// GET /api/v1/messages/status?message_id=xxx
// 3rd party can check message delivery status
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

    // Verify API key
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("api_key", apiKey)
      .single();

    if (!org) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const messageId = request.nextUrl.searchParams.get("message_id");
    if (!messageId) {
      return NextResponse.json(
        { error: "message_id query parameter is required" },
        { status: 400 }
      );
    }

    const { data: message } = await supabase
      .from("messages")
      .select("id, to_phone, status, content, sent_at, delivered_at, read_at, error_message, created_at")
      .eq("id", messageId)
      .eq("org_id", org.id)
      .single();

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json(message);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

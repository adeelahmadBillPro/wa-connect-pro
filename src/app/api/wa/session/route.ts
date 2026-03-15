import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import {
  startSession,
  getSessionStatus,
  disconnectSession,
} from "@/lib/wa-session-manager";

export const dynamic = "force-dynamic";

// GET - Get session status + QR code
export async function GET(request: NextRequest) {
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

    const sessionId = request.nextUrl.searchParams.get("session_id");

    if (sessionId) {
      // Get specific session status from memory
      const memoryStatus = await getSessionStatus(sessionId);
      const { data: dbSession } = await supabase
        .from("wa_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("org_id", member.org_id)
        .single();

      return NextResponse.json({
        ...dbSession,
        qr_code: memoryStatus.qrCode,
        live_status: memoryStatus.status,
      });
    }

    // Get all sessions for org
    const { data: sessions } = await supabase
      .from("wa_sessions")
      .select("*")
      .eq("org_id", member.org_id)
      .order("created_at", { ascending: false });

    // Enrich with memory status
    const enriched = (sessions || []).map((s) => {
      const memStatus = getSessionStatus(s.id);
      return { ...s };
    });

    return NextResponse.json({ sessions: enriched });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create new session or start existing
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
    const { action, session_id, session_name, daily_limit } = body;

    const serviceSupabase = createServiceClient();

    if (action === "create") {
      // Create new session
      const { data: session, error } = await serviceSupabase
        .from("wa_sessions")
        .insert({
          org_id: member.org_id,
          session_name: session_name || "Default",
          daily_limit: daily_limit || 700,
          status: "disconnected",
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Failed to create session" },
          { status: 500 }
        );
      }

      return NextResponse.json({ session });
    }

    if (action === "start" && session_id) {
      // Verify session belongs to org
      const { data: session } = await supabase
        .from("wa_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("org_id", member.org_id)
        .single();

      if (!session) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      const result = await startSession(session_id, member.org_id);
      return NextResponse.json(result);
    }

    if (action === "disconnect" && session_id) {
      const result = await disconnectSession(session_id);
      return NextResponse.json(result);
    }

    if (action === "delete" && session_id) {
      try {
        await disconnectSession(session_id);
      } catch {
        // Session may not be in memory — that's fine
      }
      await serviceSupabase
        .from("wa_sessions")
        .delete()
        .eq("id", session_id)
        .eq("org_id", member.org_id);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

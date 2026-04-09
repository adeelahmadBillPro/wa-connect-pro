import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionStatus } from "@/lib/wa-session-manager";

export const dynamic = "force-dynamic";

// GET - Get QR code as base64 image
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const sessionId = request.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json(
        { error: "session_id required" },
        { status: 400 }
      );
    }

    const { data: member } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    if (!member) {
      // If user is authenticated via API key, they may not have org_members row
      const memoryStatus = await getSessionStatus(sessionId);
      return NextResponse.json({
        status: memoryStatus.status,
        // qrCode is already a data URL (converted in session manager)
        qr_image: memoryStatus.qrCode || null,
      });
    }

    // Verify session belongs to org
    const { data: session } = await supabase
      .from("wa_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("org_id", member.org_id)
      .single();

    if (!session) {
      const memoryStatus = await getSessionStatus(sessionId);
      if (memoryStatus.status !== "disconnected") {
        return NextResponse.json({
          status: memoryStatus.status,
          qr_image: memoryStatus.qrCode || null,
        });
      }
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const memoryStatus = await getSessionStatus(sessionId);

    if (memoryStatus.status === "connected") {
      return NextResponse.json({
        status: "connected",
        qr_image: null,
      });
    }

    return NextResponse.json({
      status: memoryStatus.status,
      // qrCode is already a data URL — return directly
      qr_image: memoryStatus.qrCode || null,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

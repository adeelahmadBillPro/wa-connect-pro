import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionStatus } from "@/lib/wa-session-manager";
import QRCode from "qrcode";

// GET - Get QR code as base64 image
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    // Verify session belongs to org
    const { data: session } = await supabase
      .from("wa_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("org_id", member.org_id)
      .single();

    if (!session) {
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

    if (memoryStatus.qrCode) {
      // Convert QR string to base64 image
      const qrImage = await QRCode.toDataURL(memoryStatus.qrCode, {
        width: 300,
        margin: 2,
      });

      return NextResponse.json({
        status: memoryStatus.status,
        qr_image: qrImage,
      });
    }

    return NextResponse.json({
      status: memoryStatus.status,
      qr_image: null,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

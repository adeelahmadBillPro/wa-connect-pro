import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionStatus } from "@/lib/wa-session-manager";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

// GET - Get QR code as base64 image
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
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

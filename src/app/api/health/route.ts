import { NextResponse } from "next/server";
import { getActiveSessions } from "@/lib/wa-session-manager";

export const dynamic = "force-dynamic";

// Lightweight health check for monitoring + post-deploy verification.
// Public (no auth) so curl from anywhere works. Intentionally does NOT
// touch Supabase — a flaky DB shouldn't fail the liveness signal that
// load balancers / uptime monitors rely on.
export async function GET() {
  const activeSessions = getActiveSessions();
  return NextResponse.json({
    status: "ok",
    uptime_seconds: Math.floor(process.uptime()),
    sessions_connected: activeSessions.length,
    session_ids: activeSessions,
    timestamp: new Date().toISOString(),
  });
}

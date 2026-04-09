import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// GET /api/admin/cleanup?secret=YOUR_CRON_SECRET
// Call this daily via cron to delete old records
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const results: Record<string, number> = {};

  // Delete messages older than 90 days
  const { count: msgs } = await supabase
    .from("messages")
    .delete({ count: "exact" })
    .lt("created_at", daysAgo(90));
  results.messages_deleted = msgs || 0;

  // Delete API logs older than 30 days
  const { count: logs } = await supabase
    .from("api_logs")
    .delete({ count: "exact" })
    .lt("created_at", daysAgo(30));
  results.api_logs_deleted = logs || 0;

  // Delete completed/failed queue records older than 7 days
  const { count: queue } = await supabase
    .from("wa_message_queue")
    .delete({ count: "exact" })
    .in("status", ["sent", "failed"])
    .lt("created_at", daysAgo(7));
  results.queue_deleted = queue || 0;

  // Delete credit transactions older than 180 days
  const { count: credits } = await supabase
    .from("credit_transactions")
    .delete({ count: "exact" })
    .lt("created_at", daysAgo(180));
  results.credit_transactions_deleted = credits || 0;

  console.log("[CLEANUP]", results);

  return NextResponse.json({
    success: true,
    deleted: results,
    ran_at: new Date().toISOString(),
  });
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

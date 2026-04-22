import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Daily cron — call once per day at 00:00 UTC.
// Resets messages_sent_today to 0 for every session. This replaces the old
// /root/wa-daily-reset.sh bash script — the application is now self-contained.
//
// Wire up in crontab as:
//   0 0 * * * curl -fsS "https://YOUR-DOMAIN/api/cron/update-warmup?secret=$CRON_SECRET" >> /var/log/wa-cron.log 2>&1
//
// Auth: requires ?secret=<CRON_SECRET env var>. The fallback "process" string
// matches the convention used by /api/wa/queue so existing cron entries keep
// working while operators rotate to a real secret.
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET && secret !== "process") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Reset every session that has sent at least one message today. Avoids a
  // pointless write on idle rows. The id filter is a no-op WHERE clause that
  // PostgREST requires — it refuses bare UPDATEs without a predicate.
  const { data, error } = await supabase
    .from("wa_sessions")
    .update({ messages_sent_today: 0 })
    .gt("messages_sent_today", 0)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    reset: data?.length ?? 0,
    timestamp: new Date().toISOString(),
  });
}

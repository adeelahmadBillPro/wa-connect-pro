import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { sendWAMessage } from "@/lib/wa-session-manager";
import { checkSubscription, incrementSubscriptionUsage } from "@/lib/check-subscription";
import { isPlatformAdmin } from "@/lib/admin";
import { isWithinBusinessHours } from "@/lib/business-hours";

export const dynamic = "force-dynamic";

// POST - Queue bulk messages (campaign-style) with rate limiting
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
    const { messages, session_id } = body;
    // messages: [{ to_phone, message, message_type?, media_url?, caption? }]

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    // Admin bypass — no subscription limits for platform admins
    const isAdmin = isPlatformAdmin(user.id);

    // Check subscription limits (skip for admins)
    const subCheck = await checkSubscription(supabase, member.org_id);
    if (!isAdmin && !subCheck.allowed) {
      return NextResponse.json(
        { error: subCheck.error },
        { status: 429 }
      );
    }

    // Check if subscription has enough messages remaining (skip for admins and unlimited plans)
    if (!isAdmin && subCheck.subscription && !subCheck.subscription.is_unlimited && subCheck.subscription.messages_remaining < messages.length) {
      return NextResponse.json(
        {
          error: `Not enough messages in your plan. Need ${messages.length}, remaining ${subCheck.subscription.messages_remaining}. Please upgrade your plan.`,
          remaining: subCheck.subscription.messages_remaining,
        },
        { status: 429 }
      );
    }

    // Find connected sessions. Trust DB status; subscription monthly quota
    // is the business gate (checked upstream by the caller).
    const { data: sessions } = await supabase
      .from("wa_sessions")
      .select("id, daily_limit, messages_sent_today")
      .eq("org_id", member.org_id)
      .eq("status", "connected");

    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        { error: "No active WhatsApp session." },
        { status: 400 }
      );
    }

    // Distribute messages across sessions
    let sessionIndex = 0;
    const queueRecords = messages.map(
      (msg: {
        to_phone: string;
        message: string;
        message_type?: string;
        media_url?: string;
        caption?: string;
      }) => {
        // Round-robin across sessions
        const assignedSession = sessions[sessionIndex % sessions.length];
        sessionIndex++;

        return {
          org_id: member.org_id,
          session_id: session_id || assignedSession.id,
          to_phone: msg.to_phone.replace(/[^0-9+]/g, ""),
          message_type: msg.message_type || "text",
          content: msg.message,
          media_url: msg.media_url || null,
          caption: msg.caption || null,
          status: "pending" as const,
        };
      }
    );

    // Insert into queue
    const { data: queued, error } = await supabase
      .from("wa_message_queue")
      .insert(queueRecords)
      .select("id");

    if (error) {
      return NextResponse.json(
        { error: "Failed to queue messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      queued: queued?.length || 0,
      total: messages.length,
      message: `${messages.length} messages queued. They will be sent with safe delays.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET - Process pending queue messages (call this via cron or interval)
export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get("secret");
    // Simple protection for the cron endpoint
    if (secret !== process.env.CRON_SECRET && secret !== "process") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Get pending messages (oldest first, limit batch)
    const { data: pending } = await supabase
      .from("wa_message_queue")
      .select("*, session:wa_sessions(*)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    if (!pending || pending.length === 0) {
      return NextResponse.json({ processed: 0, message: "No pending messages" });
    }

    // Cache org → timezone lookups so we don't hit the DB once per message
    // (most batches are from a small handful of orgs).
    const orgTimezones = new Map<string, string>();
    async function timezoneFor(orgId: string): Promise<string> {
      const cached = orgTimezones.get(orgId);
      if (cached) return cached;
      const { data: org } = await supabase
        .from("organizations")
        .select("timezone")
        .eq("id", orgId)
        .single();
      const tz = (org?.timezone as string | undefined) || "Asia/Karachi";
      orgTimezones.set(orgId, tz);
      return tz;
    }

    let sent = 0;
    let failed = 0;
    let skippedQuiet = 0;

    for (const msg of pending) {
      // Business-hours gate. Urgent messages (lab reports etc.) bypass.
      // Out-of-hours non-urgent rows stay 'pending' for the next window.
      if (!msg.urgent) {
        const tz = await timezoneFor(msg.org_id);
        if (!isWithinBusinessHours(tz)) {
          skippedQuiet++;
          continue;
        }
      }

      // If the queued msg lost its session pointer, pick a connected one.
      // Don't gate on the in-memory Map here — that check surfaces as empty
      // from this route under Next.js bundling; sendWAMessage() below is
      // the ground-truth liveness check and throws if the socket is dead.
      if (!msg.session_id) {
        const { data: altSessions } = await supabase
          .from("wa_sessions")
          .select("id")
          .eq("org_id", msg.org_id)
          .eq("status", "connected")
          .limit(1);

        if (!altSessions || altSessions.length === 0) {
          continue;
        }
        msg.session_id = altSessions[0].id;
      }

      // Business quota lives on the subscription; per-session daily gate
      // is removed. sendWAMessage() below is the ground-truth liveness check.
      try {
        // Mark as sending
        await supabase
          .from("wa_message_queue")
          .update({ status: "sending" })
          .eq("id", msg.id);

        const result = await sendWAMessage(msg.session_id, msg.to_phone, {
          type: (msg.message_type as "text" | "image" | "document" | "video") || "text",
          content: msg.content,
          mediaUrl: msg.media_url || undefined,
          caption: msg.caption || undefined,
        });

        // Update queue record
        await supabase
          .from("wa_message_queue")
          .update({
            status: "sent",
            whatsapp_message_id: result.messageId,
            sent_at: new Date().toISOString(),
          })
          .eq("id", msg.id);

        // Save to messages table — content trimmed to save DB space
        await supabase.from("messages").insert({
          org_id: msg.org_id,
          to_phone: msg.to_phone,
          message_type: msg.message_type || "text",
          content: msg.content?.slice(0, 100) || null,
          media_url: msg.media_url,
          status: "sent",
          whatsapp_message_id: result.messageId,
          wa_session_id: msg.session_id,
          campaign_id: msg.campaign_id,
          sent_at: new Date().toISOString(),
        });

        // Update session counter — read + increment atomically-ish. We only
        // need the current messages_sent_today to bump it; no gate on it.
        const { data: currentSession } = await supabase
          .from("wa_sessions")
          .select("messages_sent_today")
          .eq("id", msg.session_id)
          .single();

        await supabase
          .from("wa_sessions")
          .update({
            messages_sent_today: (currentSession?.messages_sent_today || 0) + 1,
            last_message_at: new Date().toISOString(),
          })
          .eq("id", msg.session_id);

        // Increment subscription usage
        const orgSubCheck = await checkSubscription(supabase, msg.org_id);
        if (orgSubCheck.subscription) {
          await incrementSubscriptionUsage(supabase, orgSubCheck.subscription.id);
        }

        sent++;

        // Anti-ban: random 15-45s gap between sends. Combined with the
        // typing-presence pause inside sendWAMessage(), each message takes
        // roughly 18-50s end-to-end, which is well outside automated-bot
        // throughput while still clearing a few hundred msgs per cron hour.
        const delay = 15000 + Math.floor(Math.random() * 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (error: any) {
        failed++;
        await supabase
          .from("wa_message_queue")
          .update({
            status: "failed",
            error_message: error?.message || "Send failed",
            retry_count: (msg.retry_count || 0) + 1,
          })
          .eq("id", msg.id);
      }
    }

    return NextResponse.json({
      processed: sent + failed,
      sent,
      failed,
      skipped_quiet_hours: skippedQuiet,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

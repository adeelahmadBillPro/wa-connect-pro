import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import {
  startSession,
  getSessionStatus,
  disconnectSession,
} from "@/lib/wa-session-manager";
import { getBanFreeze, freezeHoursRemaining } from "@/lib/ban-freeze";
import { hasAuth } from "@/lib/baileys-supabase-auth";

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
    const enriched = (sessions || []).map((s) => ({ ...s }));

    // Phase 8: include current subscription quota so the UI can show
    // "X of Y messages remaining this month" alongside per-session daily.
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("org_id", member.org_id)
      .eq("status", "active")
      .gte("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let subscription = null;
    if (sub) {
      const planLimit = sub.plan?.message_limit ?? 0;
      const isUnlimited = planLimit >= 999999;
      const used = sub.messages_used ?? 0;
      const remaining = isUnlimited ? Infinity : Math.max(0, planLimit - used);
      const expiresMs = sub.expires_at ? new Date(sub.expires_at).getTime() : 0;
      const daysRemaining = Math.max(0, Math.ceil((expiresMs - Date.now()) / (1000 * 60 * 60 * 24)));
      subscription = {
        plan_name: sub.plan?.name ?? "Plan",
        message_limit: planLimit,
        messages_used: used,
        messages_remaining: isUnlimited ? Number.MAX_SAFE_INTEGER : remaining,
        is_unlimited: isUnlimited,
        expires_at: sub.expires_at,
        days_remaining: daysRemaining,
      };
    }

    // Phase 8 (H4): if a recent ban triggered a 24h freeze, surface it so the
    // UI can show a warning instead of letting admin try to add new numbers.
    const freeze = await getBanFreeze(supabase);
    let banFreeze = null;
    if (freeze) {
      banFreeze = {
        active: true,
        freeze_until: freeze.freeze_until,
        hours_remaining: await freezeHoursRemaining(supabase),
        reason: freeze.reason,
      };
    }

    return NextResponse.json({ sessions: enriched, subscription, ban_freeze: banFreeze });
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
          // Business quota lives on the subscription (monthly limit).
          // Per-session daily_limit is tracking-only; set high so it can't
          // silently gate sends.
          daily_limit: daily_limit || 1_000_000,
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

      // Phase 8 (H4): if this VPS recently got a hard ban, refuse to spin
      // up a NEW QR scan (auth row missing = brand new). Existing sessions
      // with auth in DB can still reconnect — those are already-trusted
      // devices and don't add fresh ban surface area.
      const freeze = await getBanFreeze(supabase);
      const alreadyHasAuth = await hasAuth(session_id);
      if (freeze && !alreadyHasAuth) {
        const hours = await freezeHoursRemaining(supabase);
        return NextResponse.json(
          {
            error:
              `New WhatsApp scans are temporarily blocked on this server. ` +
              `A recent ban was detected; WhatsApp correlates bans by IP, so creating ` +
              `more numbers in the next ${hours}h is high-risk. Existing sessions still work.`,
            code: "BAN_FREEZE_ACTIVE",
            freeze_until: freeze.freeze_until,
            hours_remaining: hours,
          },
          { status: 429 }
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
        await disconnectSession(session_id, true); // true = also delete local auth files
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

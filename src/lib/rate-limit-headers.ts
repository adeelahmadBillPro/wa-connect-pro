// Standard rate-limit response headers.
//
// Three industry-standard headers attached to every /api/v1/* response so
// integrators (BloodSampleProject etc.) can show "X messages remaining
// today" UI without doing a separate /status query.
//
//   X-RateLimit-Daily-Limit     total allowed today across the org's sessions
//   X-RateLimit-Daily-Remaining how many of those are still available
//   X-RateLimit-Reset           unix timestamp (seconds) of next 00:00 UTC
//
// Computed from the org's wa_sessions rows (sum of daily_limit and of
// messages_sent_today). Kept tiny and synchronous-looking so callers can
// just `attachRateLimitHeaders(res, ...)` and forget.

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetUnix: number;
}

// Sums daily_limit and messages_sent_today across the org's CONNECTED
// sessions. Idle (disconnected) sessions don't contribute to capacity.
export async function computeOrgRateLimit(
  supabase: SupabaseClient,
  orgId: string,
): Promise<RateLimitInfo> {
  const { data: sessions } = await supabase
    .from("wa_sessions")
    .select("daily_limit, messages_sent_today")
    .eq("org_id", orgId)
    .eq("status", "connected")
    .eq("is_active", true);

  let limit = 0;
  let used = 0;
  if (sessions) {
    for (const s of sessions) {
      limit += Number(s.daily_limit ?? 0);
      used += Number(s.messages_sent_today ?? 0);
    }
  }
  const remaining = Math.max(0, limit - used);

  // Next 00:00 UTC. The daily reset cron runs at this boundary.
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0,
  ));
  const resetUnix = Math.floor(tomorrow.getTime() / 1000);

  return { limit, remaining, resetUnix };
}

// Mutates the response headers in place and returns it for chainability.
export function attachRateLimitHeaders(
  response: NextResponse,
  info: RateLimitInfo,
): NextResponse {
  response.headers.set("X-RateLimit-Daily-Limit", String(info.limit));
  response.headers.set("X-RateLimit-Daily-Remaining", String(info.remaining));
  response.headers.set("X-RateLimit-Reset", String(info.resetUnix));
  return response;
}

// Convenience: build & attach in one call. Most route handlers don't need
// the RateLimitInfo for anything except the headers.
export async function withRateLimitHeaders(
  supabase: SupabaseClient,
  orgId: string,
  response: NextResponse,
): Promise<NextResponse> {
  try {
    const info = await computeOrgRateLimit(supabase, orgId);
    attachRateLimitHeaders(response, info);
  } catch {
    // Header attachment is best-effort — never block the actual response.
  }
  return response;
}

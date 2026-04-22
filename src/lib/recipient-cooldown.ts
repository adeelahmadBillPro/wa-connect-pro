// Per-recipient cooldown — opt-in spam guard.
//
// When organizations.per_recipient_daily_limit is 0 (the default), this
// module is a no-op. When set to N > 0, it caps each (org, to_phone) pair
// to N messages per rolling 24h window.
//
// Used by the send endpoints to refuse messages with HTTP 429 BEFORE the
// expensive WhatsApp call and BEFORE any credit deduction.

import type { SupabaseClient } from "@supabase/supabase-js";

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

export class RecipientCooldownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipientCooldownError";
  }
}

// Returns true if cooldown is enabled for this org. Lets callers skip the
// check entirely with a single tiny query when the feature is off.
export async function getCooldownLimit(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { data } = await supabase
    .from("organizations")
    .select("per_recipient_daily_limit")
    .eq("id", orgId)
    .single();
  return Number(data?.per_recipient_daily_limit ?? 0);
}

// Throws RecipientCooldownError if (orgId, toPhone) has reached the limit
// inside the last 24h. Safe to call when cooldown is disabled — it just
// returns immediately.
export async function assertWithinCooldown(
  supabase: SupabaseClient,
  orgId: string,
  toPhone: string,
  limit: number,
): Promise<void> {
  if (limit <= 0) return;

  const { data: row } = await supabase
    .from("wa_recipient_sends")
    .select("count_24h, last_sent_at")
    .eq("org_id", orgId)
    .eq("to_phone", toPhone)
    .maybeSingle();

  if (!row) return;

  const lastSent = new Date(row.last_sent_at).getTime();
  const stillInWindow = Date.now() - lastSent < ROLLING_WINDOW_MS;
  if (stillInWindow && (row.count_24h ?? 0) >= limit) {
    throw new RecipientCooldownError(
      `RECIPIENT_COOLDOWN: ${toPhone} has already received ${row.count_24h} messages in the last 24 hours (limit ${limit}).`,
    );
  }
}

// Record a successful send. If the previous send was outside the window,
// reset to 1; otherwise increment.
export async function recordRecipientSend(
  supabase: SupabaseClient,
  orgId: string,
  toPhone: string,
  limit: number,
): Promise<void> {
  if (limit <= 0) return;

  const { data: row } = await supabase
    .from("wa_recipient_sends")
    .select("count_24h, last_sent_at")
    .eq("org_id", orgId)
    .eq("to_phone", toPhone)
    .maybeSingle();

  const now = new Date().toISOString();
  let nextCount = 1;
  if (row) {
    const lastSent = new Date(row.last_sent_at).getTime();
    const stillInWindow = Date.now() - lastSent < ROLLING_WINDOW_MS;
    nextCount = stillInWindow ? (row.count_24h ?? 0) + 1 : 1;
  }

  await supabase
    .from("wa_recipient_sends")
    .upsert(
      { org_id: orgId, to_phone: toPhone, count_24h: nextCount, last_sent_at: now },
      { onConflict: "org_id,to_phone" },
    );
}

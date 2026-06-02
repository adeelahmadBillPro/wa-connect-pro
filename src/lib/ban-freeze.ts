// IP-level ban freeze coordinator.
//
// When ANY session on this VPS gets a hard ban (Phase 6 classification:
// 401 logout = no, 403/405/419 = yes), WhatsApp has correlated the ban
// against the IP. Creating a NEW session in the next 24h is asking for
// the new session to be banned too — the audit showed this is exactly
// what happened after the VPS migration.
//
// This module:
//   - markBanFreeze()  → called from the disconnect handler on TRUE ban
//   - isFrozen()       → called by /api/wa/session before allowing a
//                        fresh start that would generate a new QR
//
// Existing sessions (already-trusted devices) are NOT affected. The
// freeze ONLY blocks creating a new QR scan during the cooldown window.

import type { SupabaseClient } from "@supabase/supabase-js";

const STATE_KEY = "vps_ban_freeze_until";
const FREEZE_HOURS = 24;

export interface BanFreezeState {
  freeze_until: string;        // ISO timestamp
  reason: string;              // human-readable
  status_code: number | null;
  session_id: string;
}

// Returns the active freeze, or null if not frozen.
export async function getBanFreeze(
  supabase: SupabaseClient,
): Promise<BanFreezeState | null> {
  const { data } = await supabase
    .from("platform_state")
    .select("value")
    .eq("key", STATE_KEY)
    .maybeSingle();
  if (!data?.value) return null;
  const state = data.value as BanFreezeState;
  if (!state.freeze_until) return null;
  if (new Date(state.freeze_until).getTime() < Date.now()) {
    // Expired — caller doesn't need to clean up, just treat as cleared.
    return null;
  }
  return state;
}

export async function isFrozen(supabase: SupabaseClient): Promise<boolean> {
  return (await getBanFreeze(supabase)) !== null;
}

// Record a ban event. Sets the freeze to NOW + 24h. Repeated calls within
// the window EXTEND the freeze (each new ban resets the 24h clock — if
// bans keep happening, we keep waiting).
export async function markBanFreeze(
  supabase: SupabaseClient,
  reason: string,
  statusCode: number | null,
  sessionId: string,
): Promise<void> {
  const freezeUntil = new Date(Date.now() + FREEZE_HOURS * 60 * 60 * 1000).toISOString();
  const state: BanFreezeState = {
    freeze_until: freezeUntil,
    reason,
    status_code: statusCode,
    session_id: sessionId,
  };
  const { error } = await supabase
    .from("platform_state")
    .upsert(
      { key: STATE_KEY, value: state, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) console.error("[BAN-FREEZE] failed to mark freeze:", error.message);
  else console.log(`[BAN-FREEZE] active until ${freezeUntil} (${reason})`);
}

// Hours remaining in the freeze (for UI / API error messages). Returns 0 if
// not frozen.
export async function freezeHoursRemaining(supabase: SupabaseClient): Promise<number> {
  const state = await getBanFreeze(supabase);
  if (!state) return 0;
  const ms = new Date(state.freeze_until).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (60 * 60 * 1000)));
}

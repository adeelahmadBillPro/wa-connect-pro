-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 8: Stability hardening (post-audit fixes C1/C3/S1/S2/H1/H3/H4)
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: Audit found that one 403 on a VPS tends to cascade — WhatsApp's anti-
-- spam system correlates bans by IP. The runtime fixes prevent the cascade,
-- but we also need a tiny key/value store to coordinate the 24h IP freeze
-- across requests (in-process Map would not survive a PM2 restart and would
-- not work across cluster mode).
--
-- New table:
--   platform_state   simple key/value JSON store, service-role only.
--                    Used today for:
--                      key='vps_ban_freeze_until' → { freeze_until: ISO, reason, session_id }
--                    Future-proofs us for other shared runtime knobs without
--                    needing yet another tiny table per concern.
--
-- HOW TO APPLY:
--   1. Open Supabase → SQL Editor
--   2. Paste this whole file and Run
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.platform_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table public.platform_state enable row level security;
-- No policies = service role only. Regular users have no business reading this.

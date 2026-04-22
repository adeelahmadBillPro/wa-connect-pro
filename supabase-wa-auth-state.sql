-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1: Supabase-backed Baileys auth state
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: Previously Baileys credentials lived in `.baileys_auth/` on the host's
-- filesystem. On any redeploy / VPS migration / container restart those files
-- vanish and every connected number must re-scan QR.
--
-- This table moves all auth state (creds + signal-protocol keys) to Postgres,
-- so sessions survive restarts forever.
--
-- HOW TO APPLY:
--   1. Open Supabase → SQL Editor
--   2. Paste this whole file and Run
--   3. Deploy the new app code (uses useSupabaseAuthState instead of files)
--   4. ONE-TIME: every currently connected number must re-scan QR once.
--      After that initial re-scan, sessions persist permanently in this table.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.wa_auth_state (
  session_id uuid not null references public.wa_sessions(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz default now(),
  primary key (session_id, key)
);

create index if not exists idx_wa_auth_state_session on public.wa_auth_state(session_id);

-- Service role only — no SELECT/INSERT/UPDATE/DELETE policies for users.
-- The service role bypasses RLS entirely; regular users have no access.
alter table public.wa_auth_state enable row level security;

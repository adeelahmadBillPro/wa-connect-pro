-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 6: Ban detection — proper disconnect-code handling
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: Current code retries forever on ANY non-401 disconnect, including ban
-- codes (403/405/419). That's an infinite loop against an already-banned
-- number, which can compound the damage. Phase 6 classifies codes and stops
-- reconnect attempts on hard bans.
--
-- This migration adds 3 columns the runtime needs to detect repeat-failure
-- patterns ("5 disconnects in 1 hour → assume banned"):
--
--   consecutive_disconnects (int, default 0)
--     Increments on every connection.close, resets on connection.open.
--
--   last_disconnect_code (int, nullable)
--     Last seen statusCode for debugging.
--
--   last_disconnect_at (timestamptz, nullable)
--     Used to check if 5 disconnects happened inside a 1h window.
--
-- The 'banned' value is already in the wa_sessions.status check constraint
-- (added in supabase-wa-sessions.sql), so no enum change needed.
--
-- HOW TO APPLY:
--   1. Open Supabase → SQL Editor
--   2. Paste this whole file and Run
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.wa_sessions
  add column if not exists consecutive_disconnects integer not null default 0,
  add column if not exists last_disconnect_code integer,
  add column if not exists last_disconnect_at timestamptz;

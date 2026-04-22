-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2: Per-session manual override + trust score columns
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: Adds two columns that future phases (and admin tooling) need:
--
--   - trust_score (0-100, default 100): Phase 6 will decay this on warning
--     disconnect codes. UI can show a banner if it drops too low.
--   - manual_daily_limit_override (nullable): admin escape-hatch — if this
--     is set, anything that auto-adjusts daily_limit must respect it as
--     ground truth and not overwrite.
--
-- The cron route at /api/cron/update-warmup ONLY resets messages_sent_today
-- now — it does NOT auto-tune daily_limit. Admin sets daily_limit manually
-- per number, and warms new numbers up by hand.
--
-- HOW TO APPLY:
--   1. Open Supabase → SQL Editor
--   2. Paste this whole file and Run
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.wa_sessions
  add column if not exists trust_score integer default 100,
  add column if not exists manual_daily_limit_override integer;

-- Sanity bounds for trust_score (0-100). The app code clamps too, but a
-- check constraint stops bad writes from ever reaching the table.
alter table public.wa_sessions
  drop constraint if exists wa_sessions_trust_score_check;
alter table public.wa_sessions
  add constraint wa_sessions_trust_score_check
  check (trust_score >= 0 and trust_score <= 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3: Anti-ban polish (timezone + urgent flag)
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: Two small column additions to support the runtime changes:
--
--   organizations.timezone
--     Default 'Asia/Karachi'. The queue worker uses this to decide whether
--     to send during the org's local business hours (10am-8pm). Out-of-hours
--     messages are left pending until the next business window.
--
--   wa_message_queue.urgent
--     Default false. When true, the queue worker sends immediately even
--     outside business hours. Use this for time-critical content like lab
--     reports / appointment confirmations. Marketing campaigns leave it
--     false so they pile up overnight and start sending at 10am.
--
-- HOW TO APPLY:
--   1. Open Supabase → SQL Editor
--   2. Paste this whole file and Run
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.organizations
  add column if not exists timezone text not null default 'Asia/Karachi';

alter table public.wa_message_queue
  add column if not exists urgent boolean not null default false;

-- Help the cron worker quickly find pending+non-urgent rows that are still
-- waiting on business hours. (Pending+urgent are always eligible to send.)
create index if not exists idx_wa_queue_pending_urgent
  on public.wa_message_queue(status, urgent)
  where status = 'pending';

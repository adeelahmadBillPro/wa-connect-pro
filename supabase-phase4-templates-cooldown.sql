-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4: Template variants + per-recipient cooldown (opt-in)
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: Two safety nets against the most common ban triggers — sending the
-- exact same wording to many recipients (variants help), and hammering the
-- same number multiple times in 24h (cooldown helps).
--
-- BOTH ARE OPT-IN, so existing customers see ZERO behaviour change:
--
--   message_templates.body_variants
--     Empty array '[]' by default. If admin adds alternative wordings,
--     the send code picks one at random per send and applies the same
--     {{1}}/{{2}} param substitutions. With no variants, body_text is
--     used exactly as today.
--
--   organizations.per_recipient_daily_limit
--     Default 0 = DISABLED. The send code only runs the cooldown check
--     when this is > 0. Set to 5 (or whatever) per org to enable.
--     Purpose: stop a single number receiving more than N messages in
--     a rolling 24h window from one org. Lab clients can leave at 0;
--     marketing-only orgs can opt in.
--
--   wa_recipient_sends
--     Tracks per-(org, phone) send count + last_sent_at. Used only when
--     per_recipient_daily_limit > 0.
--
-- HOW TO APPLY:
--   1. Open Supabase → SQL Editor
--   2. Paste this whole file and Run
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Template variants
alter table public.message_templates
  add column if not exists body_variants jsonb not null default '[]'::jsonb;

-- 2. Per-org cooldown setting (0 = disabled; >0 = max sends per 24h to same number)
alter table public.organizations
  add column if not exists per_recipient_daily_limit integer not null default 0;

alter table public.organizations
  drop constraint if exists organizations_recipient_limit_check;
alter table public.organizations
  add constraint organizations_recipient_limit_check
  check (per_recipient_daily_limit >= 0);

-- 3. Per-recipient send tracking (only written when cooldown is enabled)
create table if not exists public.wa_recipient_sends (
  org_id uuid not null references public.organizations(id) on delete cascade,
  to_phone text not null,
  count_24h integer not null default 0,
  last_sent_at timestamptz not null default now(),
  primary key (org_id, to_phone)
);

create index if not exists idx_wa_recipient_sends_org_time
  on public.wa_recipient_sends(org_id, last_sent_at);

-- Service-role-only access; users have no business reading this table.
alter table public.wa_recipient_sends enable row level security;

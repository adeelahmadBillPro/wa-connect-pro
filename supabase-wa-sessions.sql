-- WhatsApp Web Sessions & Message Queue
-- Run this in Supabase SQL Editor

-- 1. WhatsApp Web Sessions table
create table if not exists public.wa_sessions (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  session_name text not null default 'Default',
  phone_number text,
  status text check (status in ('connecting', 'qr_ready', 'connected', 'disconnected', 'banned')) default 'disconnected',
  is_active boolean default false,
  daily_limit integer default 700,
  messages_sent_today integer default 0,
  last_message_at timestamptz,
  last_connected_at timestamptz,
  created_at timestamptz default now()
);

-- 2. WhatsApp Message Queue table
create table if not exists public.wa_message_queue (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  session_id uuid references public.wa_sessions(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  to_phone text not null,
  message_type text check (message_type in ('text', 'image', 'document', 'video')) default 'text',
  content text not null,
  media_url text,
  caption text,
  status text check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')) default 'pending',
  error_message text,
  whatsapp_message_id text,
  retry_count integer default 0,
  scheduled_at timestamptz default now(),
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- 3. Indexes
create index if not exists idx_wa_sessions_org on public.wa_sessions(org_id);
create index if not exists idx_wa_queue_org on public.wa_message_queue(org_id);
create index if not exists idx_wa_queue_status on public.wa_message_queue(status);
create index if not exists idx_wa_queue_session on public.wa_message_queue(session_id);
create index if not exists idx_wa_queue_scheduled on public.wa_message_queue(scheduled_at);

-- 4. RLS Policies
alter table public.wa_sessions enable row level security;
alter table public.wa_message_queue enable row level security;

create policy "Members can view own org sessions" on public.wa_sessions
  for select using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

create policy "Members can manage own org sessions" on public.wa_sessions
  for all using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

create policy "Members can view own org queue" on public.wa_message_queue
  for select using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

create policy "Members can manage own org queue" on public.wa_message_queue
  for all using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

-- 5. Reset daily counters function (call daily via cron)
create or replace function reset_wa_daily_counters()
returns void as $$
begin
  update public.wa_sessions set messages_sent_today = 0;
end;
$$ language plpgsql security definer;

-- 6. Add wa_session_id to messages table for tracking
alter table public.messages
  add column if not exists wa_session_id uuid references public.wa_sessions(id) on delete set null;

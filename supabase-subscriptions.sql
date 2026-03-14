-- ============================================
-- WA Connect Pro - Subscription System
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. SUBSCRIPTION PLANS (what you offer)
create table if not exists public.subscription_plans (
  id uuid default uuid_generate_v4() primary key,
  name text not null,                    -- e.g. 'Basic', 'Pro', 'Enterprise'
  description text,
  price_monthly integer not null,        -- price in PKR (e.g. 3000)
  message_limit integer not null,        -- messages per month (e.g. 500)
  is_active boolean default true,
  created_at timestamptz default now() not null
);

-- 2. SUBSCRIPTIONS (which org has which plan)
create table if not exists public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  plan_id uuid references public.subscription_plans(id) not null,
  status text check (status in ('active', 'expired', 'cancelled')) default 'active' not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  messages_used integer default 0 not null,
  created_at timestamptz default now() not null
);

-- Enable RLS
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;

-- Plans are readable by everyone (public pricing)
create policy "Anyone can view active plans"
  on public.subscription_plans for select
  using (is_active = true);

-- Subscriptions visible to org members
create policy "Members can view own subscriptions"
  on public.subscriptions for select
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- Indexes
create index if not exists idx_subscriptions_org_id on public.subscriptions(org_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_expires_at on public.subscriptions(expires_at);

-- ============================================
-- ADD WEBHOOK URL TO ORGANIZATIONS
-- (3rd party can receive delivery status callbacks)
-- ============================================
alter table public.organizations add column if not exists webhook_url text;

-- ============================================
-- INSERT DEFAULT PLANS
-- ============================================
insert into public.subscription_plans (name, description, price_monthly, message_limit) values
  ('Starter', '250 messages per month — ideal for small clinics', 3000, 250),
  ('Basic', '500 messages per month — for small to mid clinics', 5000, 500),
  ('Pro', '1000 messages per month — for growing hospitals', 10000, 1000),
  ('Enterprise', '3000 messages per month — for large organizations', 25000, 3000);

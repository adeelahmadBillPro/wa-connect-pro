-- ============================================
-- WA Connect Pro - Database Schema
-- Run this ENTIRE file in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- STEP 1: CREATE ALL TABLES FIRST
-- ============================================

-- 1. PROFILES
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  phone text,
  avatar_url text,
  created_at timestamptz default now() not null
);

-- 2. ORGANIZATIONS
create table public.organizations (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  slug text unique not null,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  whatsapp_phone_number_id text,
  whatsapp_business_account_id text,
  whatsapp_access_token text,
  whatsapp_connected boolean default false,
  whatsapp_display_name text,
  whatsapp_number text,
  credits integer default 100 not null,
  api_key text unique default ('wcp_' || replace(uuid_generate_v4()::text, '-', '')) not null,
  webhook_url text,
  created_at timestamptz default now() not null
);

-- 3. ORGANIZATION MEMBERS
create table public.org_members (
  id uuid default uuid_generate_v4() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text check (role in ('owner', 'admin', 'member')) default 'member' not null,
  created_at timestamptz default now() not null,
  unique(org_id, user_id)
);

-- 4. CONTACTS
create table public.contacts (
  id uuid default uuid_generate_v4() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  phone text not null,
  email text,
  tags text[] default '{}',
  group_id uuid,
  created_at timestamptz default now() not null
);

-- 5. CONTACT GROUPS
create table public.contact_groups (
  id uuid default uuid_generate_v4() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  description text,
  created_at timestamptz default now() not null
);

-- Add foreign key for contacts.group_id
alter table public.contacts
  add constraint contacts_group_id_fkey
  foreign key (group_id) references public.contact_groups(id) on delete set null;

-- 6. MESSAGE TEMPLATES
create table public.message_templates (
  id uuid default uuid_generate_v4() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  category text check (category in ('marketing', 'utility', 'authentication')) default 'utility' not null,
  language text default 'en' not null,
  header_text text,
  body_text text not null,
  footer_text text,
  status text check (status in ('pending', 'approved', 'rejected')) default 'pending' not null,
  meta_template_id text,
  created_at timestamptz default now() not null
);

-- 7. CAMPAIGNS
create table public.campaigns (
  id uuid default uuid_generate_v4() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  template_id uuid references public.message_templates(id) on delete set null,
  group_id uuid references public.contact_groups(id) on delete set null,
  status text check (status in ('draft', 'scheduled', 'sending', 'completed', 'failed')) default 'draft' not null,
  scheduled_at timestamptz,
  total_messages integer default 0,
  sent_count integer default 0,
  delivered_count integer default 0,
  read_count integer default 0,
  failed_count integer default 0,
  created_at timestamptz default now() not null
);

-- 8. MESSAGES
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  template_id uuid references public.message_templates(id) on delete set null,
  to_phone text not null,
  message_type text check (message_type in ('template', 'text', 'image', 'document')) default 'template' not null,
  content text not null default '',
  status text check (status in ('queued', 'sent', 'delivered', 'read', 'failed')) default 'queued' not null,
  whatsapp_message_id text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz default now() not null
);

-- 9. CREDIT TRANSACTIONS
create table public.credit_transactions (
  id uuid default uuid_generate_v4() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  amount integer not null,
  type text check (type in ('purchase', 'usage', 'refund')) not null,
  description text not null default '',
  balance_after integer not null,
  created_at timestamptz default now() not null
);

-- 10. API LOGS
create table public.api_logs (
  id uuid default uuid_generate_v4() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  endpoint text not null,
  method text not null,
  status_code integer not null,
  request_body text,
  response_body text,
  created_at timestamptz default now() not null
);

-- 11. WA SESSIONS (WhatsApp Web)
create table public.wa_sessions (
  id uuid default uuid_generate_v4() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  session_name text not null default 'Default',
  phone_number text,
  status text default 'disconnected' not null,
  is_active boolean default false,
  daily_limit integer default 700,
  messages_sent_today integer default 0,
  last_message_at timestamptz,
  last_connected_at timestamptz,
  created_at timestamptz default now() not null
);

-- ============================================
-- STEP 2: ENABLE RLS ON ALL TABLES
-- ============================================
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_groups enable row level security;
alter table public.message_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.api_logs enable row level security;
alter table public.wa_sessions enable row level security;

-- ============================================
-- STEP 3: CREATE ALL RLS POLICIES
-- (now all tables exist, no dependency issues)
-- ============================================

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Organizations policies
create policy "Members can view their organizations"
  on public.organizations for select
  using (
    id in (select org_id from public.org_members where user_id = auth.uid())
  );

create policy "Owners can update their organizations"
  on public.organizations for update
  using (owner_id = auth.uid());

create policy "Authenticated users can create organizations"
  on public.organizations for insert
  with check (auth.uid() = owner_id);

-- Org members policies
create policy "Members can view org members"
  on public.org_members for select
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

create policy "Owners can manage members"
  on public.org_members for all
  using (
    org_id in (select id from public.organizations where owner_id = auth.uid())
  );

-- Contacts policies
create policy "Members can view org contacts"
  on public.contacts for select
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

create policy "Members can manage org contacts"
  on public.contacts for all
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- Contact groups policies
create policy "Members can view org groups"
  on public.contact_groups for select
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

create policy "Members can manage org groups"
  on public.contact_groups for all
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- Message templates policies
create policy "Members can view org templates"
  on public.message_templates for select
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

create policy "Members can manage org templates"
  on public.message_templates for all
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- Campaigns policies
create policy "Members can view org campaigns"
  on public.campaigns for select
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

create policy "Members can manage org campaigns"
  on public.campaigns for all
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- Messages policies
create policy "Members can view org messages"
  on public.messages for select
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

create policy "Members can insert org messages"
  on public.messages for insert
  with check (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- Credit transactions policies
create policy "Members can view org transactions"
  on public.credit_transactions for select
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- API logs policies
create policy "Members can view org api logs"
  on public.api_logs for select
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- WA Sessions policies
create policy "Members can view org wa_sessions"
  on public.wa_sessions for select
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

create policy "Members can manage org wa_sessions"
  on public.wa_sessions for all
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- ============================================
-- STEP 4: TRIGGERS AND FUNCTIONS
-- ============================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper function
create or replace function public.get_group_contact_count(group_uuid uuid)
returns integer as $$
  select count(*)::integer from public.contacts where group_id = group_uuid;
$$ language sql security definer;

-- ============================================
-- STEP 5: INDEXES
-- ============================================
create index idx_contacts_org_id on public.contacts(org_id);
create index idx_contacts_phone on public.contacts(phone);
create index idx_messages_org_id on public.messages(org_id);
create index idx_messages_campaign_id on public.messages(campaign_id);
create index idx_messages_status on public.messages(status);
create index idx_campaigns_org_id on public.campaigns(org_id);
create index idx_api_logs_org_id on public.api_logs(org_id);
create index idx_org_members_user_id on public.org_members(user_id);

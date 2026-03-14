-- ============================================
-- WA Connect Pro - Media Support Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add media header fields to message_templates
alter table public.message_templates
  add column if not exists header_type text check (header_type in ('none', 'text', 'image', 'document', 'video')) default 'none';

alter table public.message_templates
  add column if not exists header_media_url text;

-- Update existing templates: if they have header_text, set header_type to 'text'
update public.message_templates
  set header_type = 'text'
  where header_text is not null and header_text != '';

-- 2. Add media_url to messages table
alter table public.messages
  add column if not exists media_url text;

-- 3. Create storage bucket for media uploads
insert into storage.buckets (id, name, public)
  values ('media', 'media', true)
  on conflict (id) do nothing;

-- 4. Storage policies — org members can upload, anyone can read (public bucket)
create policy "Authenticated users can upload media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'media');

create policy "Anyone can view media"
  on storage.objects for select
  using (bucket_id = 'media');

create policy "Authenticated users can delete own media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'media');

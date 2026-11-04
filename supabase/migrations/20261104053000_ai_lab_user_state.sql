-- Isolated AI Lab user state. No source reports, station rows or driver data are stored.
-- Only the owning, verified platform administrator may access these preferences.
create table if not exists public.ai_lab_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  approved_formats jsonb not null default '[]'::jsonb,
  chat_history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint ai_lab_formats_array check (jsonb_typeof(approved_formats) = 'array'),
  constraint ai_lab_chat_array check (jsonb_typeof(chat_history) = 'array'),
  constraint ai_lab_formats_size check (octet_length(approved_formats::text) <= 100000),
  constraint ai_lab_chat_size check (octet_length(chat_history::text) <= 180000)
);

alter table public.ai_lab_user_state enable row level security;
revoke all on public.ai_lab_user_state from public, anon, authenticated;
grant select, insert, update on public.ai_lab_user_state to authenticated;

create policy ai_lab_user_state_read on public.ai_lab_user_state
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_platform_admin()));

create policy ai_lab_user_state_create on public.ai_lab_user_state
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_platform_admin()));

create policy ai_lab_user_state_update on public.ai_lab_user_state
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_platform_admin()))
  with check (user_id = (select auth.uid()) and (select public.is_platform_admin()));

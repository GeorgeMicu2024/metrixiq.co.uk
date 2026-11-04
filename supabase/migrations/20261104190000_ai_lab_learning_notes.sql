-- Isolated per-user, approved learning memory for AI Lab ONLY.
-- No modifications to drivers, site metrics, operational reports or existing AI Lab state.
create table if not exists public.ai_lab_learning_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site text null check (site is null or site ~ '^[A-Z0-9]{3,6}$'),
  lesson text not null check (char_length(lesson) between 10 and 350),
  created_at timestamptz not null default now()
);

create index if not exists ai_lab_learning_notes_user_recent
  on public.ai_lab_learning_notes (user_id, created_at desc);

alter table public.ai_lab_learning_notes enable row level security;

revoke all on public.ai_lab_learning_notes from anon;
grant select, insert, delete on public.ai_lab_learning_notes to authenticated;

create policy ai_lab_learning_notes_select on public.ai_lab_learning_notes
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_platform_admin()));

create policy ai_lab_learning_notes_insert on public.ai_lab_learning_notes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_platform_admin()));

create policy ai_lab_learning_notes_delete on public.ai_lab_learning_notes
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_platform_admin()));

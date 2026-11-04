-- Additive AI Lab-only semantic memory. Operational report tables are not modified.
create extension if not exists vector with schema extensions;

alter table public.ai_lab_learning_notes
  add column if not exists embedding extensions.vector(384);

-- The Edge Function uses the caller's JWT; no service-role or RLS bypass.
create policy ai_lab_learning_notes_embedding_update on public.ai_lab_learning_notes
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_platform_admin()))
  with check (user_id = (select auth.uid()) and (select public.is_platform_admin()));

-- Embeddings are the only field that may be updated via the client role.
grant update (embedding) on public.ai_lab_learning_notes to authenticated;

create or replace function public.ai_lab_semantic_notes(
  query_embedding extensions.vector(384),
  filter_site text default null,
  max_results integer default 8
)
returns table (id uuid, site text, lesson text, similarity double precision)
language sql stable security invoker
set search_path = public, extensions
as $$
  select n.id, n.site, n.lesson,
         (1 - (n.embedding <=> query_embedding))::double precision as similarity
  from public.ai_lab_learning_notes as n
  where n.user_id = (select auth.uid())
    and (select public.is_platform_admin())
    and n.embedding is not null
    and (filter_site is null or n.site is null or n.site = filter_site)
  order by n.embedding <=> query_embedding
  limit least(greatest(coalesce(max_results, 8), 1), 8);
$$;

revoke all on function public.ai_lab_semantic_notes(extensions.vector, text, integer) from public, anon;
grant execute on function public.ai_lab_semantic_notes(extensions.vector, text, integer) to authenticated;

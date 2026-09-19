-- MetrixIQ Intelligence & Reporting V5
-- Saved management report snapshots with audited generation history.

create table if not exists public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_type text not null,
  title text not null,
  site text null,
  week_label text null,
  filters jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists report_snapshots_org_created_idx
  on public.report_snapshots(organization_id,created_at desc);
create index if not exists report_snapshots_scope_idx
  on public.report_snapshots(organization_id,site,week_label,created_at desc);

alter table public.report_snapshots enable row level security;
revoke insert, update, delete on public.report_snapshots from authenticated;
grant select on public.report_snapshots to authenticated;

drop policy if exists report_snapshots_select on public.report_snapshots;
create policy report_snapshots_select on public.report_snapshots
for select to authenticated
using (
  private.has_workspace_permission(organization_id,'view_reports')
  or private.is_platform_privileged()
);

create or replace function public.save_report_snapshot(
  p_organization_id uuid,
  p_report_type text,
  p_title text,
  p_site text default null,
  p_week_label text default null,
  p_filters jsonb default '{}'::jsonb,
  p_sections jsonb default '[]'::jsonb,
  p_summary jsonb default '{}'::jsonb,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not private.has_workspace_permission(p_organization_id,'view_reports')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  if length(btrim(coalesce(p_title,''))) < 1 then
    raise exception 'Report title is required';
  end if;

  insert into public.report_snapshots(
    organization_id,report_type,title,site,week_label,filters,sections,summary,payload,created_by
  ) values (
    p_organization_id,
    coalesce(nullif(btrim(p_report_type),''),'management_report'),
    btrim(p_title),
    nullif(upper(btrim(coalesce(p_site,''))),''),
    nullif(btrim(coalesce(p_week_label,'')),''),
    coalesce(p_filters,'{}'::jsonb),
    coalesce(p_sections,'[]'::jsonb),
    coalesce(p_summary,'{}'::jsonb),
    coalesce(p_payload,'{}'::jsonb),
    (select auth.uid())
  )
  returning id into v_id;

  perform public.write_audit_event(
    p_organization_id,
    'report_generated',
    'report_snapshot',
    v_id::text,
    'Management report snapshot generated',
    null,
    p_site,
    p_week_label,
    '{}'::jsonb,
    jsonb_build_object(
      'report_type',p_report_type,
      'title',p_title,
      'site',p_site,
      'week_label',p_week_label
    ),
    jsonb_build_object('sections',coalesce(p_sections,'[]'::jsonb))
  );

  return v_id;
end;
$$;

create or replace function public.list_report_snapshots(
  p_organization_id uuid,
  p_limit integer default 200
)
returns table(
  id uuid,
  report_type text,
  title text,
  site text,
  week_label text,
  filters jsonb,
  sections jsonb,
  summary jsonb,
  payload jsonb,
  created_by uuid,
  created_by_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_reports')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select r.id,r.report_type,r.title,r.site,r.week_label,r.filters,r.sections,r.summary,r.payload,
         r.created_by,p.full_name,r.created_at
  from public.report_snapshots r
  left join public.profiles p on p.id=r.created_by
  where r.organization_id=p_organization_id
  order by r.created_at desc
  limit greatest(1,least(coalesce(p_limit,200),1000));
end;
$$;

grant execute on function public.save_report_snapshot(uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.list_report_snapshots(uuid,integer) to authenticated;

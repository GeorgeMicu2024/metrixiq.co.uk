-- Persist the daily dispatch roster so eMentor can identify scheduled drivers with no recorded trip.

create table if not exists public.daily_dispatch_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site text not null,
  dispatch_date date not null,
  route_code text not null,
  driver_id uuid null references public.drivers(id) on delete set null,
  trid text null,
  driver_name text not null,
  assignment_key text not null,
  source_route_file text null,
  source_wave_file text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_dispatch_site_not_blank check (btrim(site) <> ''),
  constraint daily_dispatch_route_not_blank check (btrim(route_code) <> ''),
  constraint daily_dispatch_name_not_blank check (btrim(driver_name) <> ''),
  constraint daily_dispatch_key_not_blank check (btrim(assignment_key) <> '')
);

create unique index if not exists daily_dispatch_assignment_unique
  on public.daily_dispatch_assignments(
    organization_id,
    site,
    dispatch_date,
    route_code,
    assignment_key
  );

create index if not exists daily_dispatch_lookup_idx
  on public.daily_dispatch_assignments(
    organization_id,
    site,
    dispatch_date desc
  );

create index if not exists daily_dispatch_driver_idx
  on public.daily_dispatch_assignments(
    organization_id,
    driver_id,
    dispatch_date desc
  )
  where driver_id is not null;

alter table public.daily_dispatch_assignments enable row level security;

revoke insert, update, delete on public.daily_dispatch_assignments from authenticated;
grant select on public.daily_dispatch_assignments to authenticated;

drop policy if exists daily_dispatch_assignments_select on public.daily_dispatch_assignments;
create policy daily_dispatch_assignments_select
on public.daily_dispatch_assignments
for select
to authenticated
using (
  (
    private.has_workspace_permission(organization_id,'view_site_operations')
    or private.has_workspace_permission(organization_id,'view_driver_data')
    or private.is_platform_privileged()
  )
  and (
    private.is_platform_privileged()
    or private.can_access_site(organization_id,site)
  )
);

create or replace function public.replace_daily_dispatch_assignments(
  p_organization_id uuid,
  p_site text,
  p_dispatch_date date,
  p_assignments jsonb,
  p_source_route_file text default null,
  p_source_wave_file text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_site text := nullif(upper(btrim(coalesce(p_site,''))),'');
  v_item jsonb;
  v_route text;
  v_trid text;
  v_name text;
  v_key text;
  v_raw_driver_id text;
  v_driver_id uuid;
  v_count integer := 0;
  v_canonical_trid text;
  v_canonical_name text;
begin
  if p_organization_id is null then
    raise exception 'Workspace is required';
  end if;
  if v_site is null then
    raise exception 'Activity Site is required';
  end if;
  if p_dispatch_date is null then
    raise exception 'Dispatch date is required';
  end if;
  if jsonb_typeof(coalesce(p_assignments,'[]'::jsonb)) <> 'array' then
    raise exception 'Dispatch assignments must be a JSON array';
  end if;

  if not private.is_platform_privileged()
     and not private.has_org_role(p_organization_id,array['owner','admin','manager','dispatcher'])
  then
    raise exception 'Not authorised to save Daily Dispatch' using errcode='42501';
  end if;

  if not private.is_platform_privileged()
     and not private.can_access_site(p_organization_id,v_site)
  then
    raise exception 'Site not accessible' using errcode='42501';
  end if;

  delete from public.daily_dispatch_assignments
  where organization_id=p_organization_id
    and site=v_site
    and dispatch_date=p_dispatch_date;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_assignments,'[]'::jsonb))
  loop
    v_route := nullif(upper(btrim(coalesce(v_item->>'route_code',''))),'');
    v_trid := nullif(upper(btrim(coalesce(v_item->>'trid',''))),'');
    v_name := nullif(btrim(coalesce(v_item->>'driver_name','')),'');
    v_key := nullif(btrim(coalesce(v_item->>'assignment_key','')),'');
    v_raw_driver_id := nullif(btrim(coalesce(v_item->>'driver_id','')),'');
    v_driver_id := null;
    v_canonical_trid := null;
    v_canonical_name := null;

    if v_route is null then
      continue;
    end if;

    if v_raw_driver_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select d.id,d.trid,d.full_name
      into v_driver_id,v_canonical_trid,v_canonical_name
      from public.drivers d
      where d.organization_id=p_organization_id
        and d.id=v_raw_driver_id::uuid
      limit 1;
    end if;

    if v_driver_id is null and v_trid is not null then
      select d.id,d.trid,d.full_name
      into v_driver_id,v_canonical_trid,v_canonical_name
      from public.drivers d
      where d.organization_id=p_organization_id
        and upper(coalesce(d.trid,''))=v_trid
      order by case when d.status='active' then 0 else 1 end,d.created_at desc
      limit 1;
    end if;

    if v_driver_id is not null then
      v_trid := coalesce(nullif(upper(btrim(coalesce(v_canonical_trid,''))),''),v_trid);
      v_name := coalesce(nullif(btrim(coalesce(v_canonical_name,'')),''),v_name,v_trid);
    end if;

    if v_name is null then
      v_name := v_trid;
    end if;

    if v_name is null or upper(v_name) in ('UNASSIGNED','DRIVER NOT FOUND','UNRESOLVED IDENTITY') then
      continue;
    end if;

    v_key := coalesce(
      v_key,
      v_driver_id::text,
      v_trid,
      lower(regexp_replace(v_name,'[^[:alnum:]]+','','g'))
    );

    if v_key is null or btrim(v_key)='' then
      continue;
    end if;

    insert into public.daily_dispatch_assignments(
      organization_id,
      site,
      dispatch_date,
      route_code,
      driver_id,
      trid,
      driver_name,
      assignment_key,
      source_route_file,
      source_wave_file,
      created_by,
      updated_at
    ) values (
      p_organization_id,
      v_site,
      p_dispatch_date,
      v_route,
      v_driver_id,
      v_trid,
      v_name,
      v_key,
      nullif(btrim(coalesce(p_source_route_file,'')),''),
      nullif(btrim(coalesce(p_source_wave_file,'')),''),
      (select auth.uid()),
      now()
    )
    on conflict (organization_id,site,dispatch_date,route_code,assignment_key)
    do update set
      driver_id=excluded.driver_id,
      trid=excluded.trid,
      driver_name=excluded.driver_name,
      source_route_file=excluded.source_route_file,
      source_wave_file=excluded.source_wave_file,
      updated_at=now();

    v_count := v_count + 1;
  end loop;

  perform public.write_audit_event(
    p_organization_id,
    'daily_dispatch_saved',
    'daily_dispatch',
    concat(v_site,':',p_dispatch_date::text),
    'Daily Dispatch roster saved',
    null,
    v_site,
    null,
    '{}'::jsonb,
    jsonb_build_object(
      'dispatch_date',p_dispatch_date,
      'assignments',v_count,
      'source_route_file',p_source_route_file,
      'source_wave_file',p_source_wave_file
    ),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'site',v_site,
    'dispatch_date',p_dispatch_date,
    'saved',v_count
  );
end;
$function$;

revoke all on function public.replace_daily_dispatch_assignments(uuid,text,date,jsonb,text,text) from public,anon;
grant execute on function public.replace_daily_dispatch_assignments(uuid,text,date,jsonb,text,text) to authenticated;

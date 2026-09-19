-- MetrixIQ Governance V2
-- Production-ready governance layer.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text null,
  driver_id uuid null references public.drivers(id) on delete set null,
  site text null,
  week_label text null,
  action text not null,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_org_created_idx on public.audit_events(organization_id, created_at desc);
create index if not exists audit_events_driver_created_idx on public.audit_events(driver_id, created_at desc);
create index if not exists audit_events_type_created_idx on public.audit_events(event_type, created_at desc);

alter table public.audit_events enable row level security;
revoke insert, update, delete on public.audit_events from authenticated;
grant select on public.audit_events to authenticated;

create table if not exists public.member_permission_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permissions jsonb not null default '{}'::jsonb,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
alter table public.member_permission_overrides enable row level security;
revoke all on public.member_permission_overrides from authenticated;

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  view_type text not null,
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  sort_config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_views_name_check check (length(btrim(name)) between 1 and 80)
);
create index if not exists saved_views_org_type_idx on public.saved_views(organization_id, view_type, updated_at desc);
alter table public.saved_views enable row level security;
grant select, insert, update, delete on public.saved_views to authenticated;

create table if not exists public.driver_metric_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  week_label text not null,
  metric_key text not null,
  source_value numeric null,
  override_value numeric not null,
  reason text null,
  status text not null default 'active' check (status in ('active','reset')),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reset_by uuid null references auth.users(id) on delete set null,
  reset_at timestamptz null,
  reset_reason text null,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists driver_metric_overrides_active_unique
  on public.driver_metric_overrides(organization_id,driver_id,week_label,metric_key)
  where status='active';
create index if not exists driver_metric_overrides_org_week_idx
  on public.driver_metric_overrides(organization_id,week_label,status);
alter table public.driver_metric_overrides enable row level security;
revoke insert, update, delete on public.driver_metric_overrides from authenticated;
grant select on public.driver_metric_overrides to authenticated;

create or replace function private.permission_defaults(p_role text)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select case lower(coalesce(p_role,'viewer'))
    when 'owner' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'admin' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'manager' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_team',true,'manage_permissions',false,'view_billing',false
    )
    when 'dispatcher' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',true,'bulk_actions',true,'manage_team',false,'manage_permissions',false,'view_billing',false
    )
    else jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',false,'bulk_actions',false,'manage_team',false,'manage_permissions',false,'view_billing',false
    )
  end;
$$;

create or replace function private.has_workspace_permission(
  p_organization_id uuid,
  p_permission text
)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select
    private.is_platform_privileged()
    or exists (
      select 1
      from public.organization_members m
      left join public.member_permission_overrides o
        on o.organization_id=m.organization_id and o.user_id=m.user_id
      where m.organization_id=p_organization_id
        and m.user_id=(select auth.uid())
        and coalesce(
          case
            when o.permissions ? p_permission then (o.permissions->>p_permission)::boolean
            else null
          end,
          (private.permission_defaults(m.role)->>p_permission)::boolean,
          false
        )
    );
$$;

drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events
for select to authenticated
using (private.has_workspace_permission(organization_id,'view_audit'));

drop policy if exists saved_views_select on public.saved_views;
create policy saved_views_select on public.saved_views
for select to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=saved_views.organization_id and m.user_id=(select auth.uid())
  )
  and (user_id=(select auth.uid()) or shared)
);
drop policy if exists saved_views_insert on public.saved_views;
create policy saved_views_insert on public.saved_views
for insert to authenticated
with check (
  user_id=(select auth.uid())
  and exists (
    select 1 from public.organization_members m
    where m.organization_id=saved_views.organization_id and m.user_id=(select auth.uid())
  )
);
drop policy if exists saved_views_update on public.saved_views;
create policy saved_views_update on public.saved_views
for update to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));
drop policy if exists saved_views_delete on public.saved_views;
create policy saved_views_delete on public.saved_views
for delete to authenticated
using (user_id=(select auth.uid()));

drop policy if exists metric_overrides_select on public.driver_metric_overrides;
create policy metric_overrides_select on public.driver_metric_overrides
for select to authenticated
using (private.can_access_driver(organization_id,driver_id));

create or replace function public.write_audit_event(
  p_organization_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_action text,
  p_driver_id uuid default null,
  p_site text default null,
  p_week_label text default null,
  p_before_data jsonb default '{}'::jsonb,
  p_after_data jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=(select auth.uid())
  ) and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  if p_driver_id is not null and not private.can_access_driver(p_organization_id,p_driver_id)
     and not private.is_platform_privileged() then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;

  insert into public.audit_events(
    organization_id,actor_id,event_type,entity_type,entity_id,driver_id,site,week_label,
    action,before_data,after_data,metadata
  ) values (
    p_organization_id,(select auth.uid()),p_event_type,p_entity_type,p_entity_id,p_driver_id,
    p_site,p_week_label,p_action,coalesce(p_before_data,'{}'::jsonb),coalesce(p_after_data,'{}'::jsonb),
    coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.list_audit_events(
  p_organization_id uuid,
  p_limit integer default 500
)
returns table(
  id uuid,actor_id uuid,actor_email text,actor_name text,event_type text,entity_type text,
  entity_id text,driver_id uuid,driver_name text,trid text,site text,week_label text,
  action text,before_data jsonb,after_data jsonb,metadata jsonb,created_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_audit') then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select a.id,a.actor_id,p.email,p.full_name,a.event_type,a.entity_type,a.entity_id,
         a.driver_id,d.full_name,d.trid,coalesce(a.site,d.site),a.week_label,a.action,
         a.before_data,a.after_data,a.metadata,a.created_at
  from public.audit_events a
  left join public.profiles p on p.id=a.actor_id
  left join public.drivers d on d.id=a.driver_id
  where a.organization_id=p_organization_id
    and (a.driver_id is null or private.can_access_driver(a.organization_id,a.driver_id) or private.is_platform_privileged())
  order by a.created_at desc
  limit greatest(1,least(coalesce(p_limit,500),2000));
end;
$$;

create or replace function public.get_my_effective_permissions(p_organization_id uuid)
returns jsonb
language sql
stable security definer
set search_path to ''
as $$
  select case
    when private.is_platform_privileged() then private.permission_defaults('owner')
    else coalesce(
      (
        select private.permission_defaults(m.role) || coalesce(o.permissions,'{}'::jsonb)
        from public.organization_members m
        left join public.member_permission_overrides o
          on o.organization_id=m.organization_id and o.user_id=m.user_id
        where m.organization_id=p_organization_id and m.user_id=(select auth.uid())
      ),
      '{}'::jsonb
    )
  end;
$$;

create or replace function public.list_workspace_permissions(p_organization_id uuid)
returns table(
  user_id uuid,email text,full_name text,role text,site_scope text[],
  permission_overrides jsonb,effective_permissions jsonb,updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'manage_team')
     and not private.has_workspace_permission(p_organization_id,'manage_permissions') then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select m.user_id,p.email,p.full_name,m.role,coalesce(m.site_scope,'{}'::text[]),
         coalesce(o.permissions,'{}'::jsonb),
         private.permission_defaults(m.role) || coalesce(o.permissions,'{}'::jsonb),
         o.updated_at
  from public.organization_members m
  left join public.profiles p on p.id=m.user_id
  left join public.member_permission_overrides o
    on o.organization_id=m.organization_id and o.user_id=m.user_id
  where m.organization_id=p_organization_id
  order by case m.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 when 'dispatcher' then 3 else 4 end,
           coalesce(p.full_name,p.email,'');
end;
$$;

create or replace function public.update_member_permission_overrides(
  p_organization_id uuid,
  p_user_id uuid,
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_target_role text;
declare v_before jsonb;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_permissions') then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  select role into v_target_role
  from public.organization_members
  where organization_id=p_organization_id and user_id=p_user_id;

  if v_target_role is null then raise exception 'Member not found'; end if;
  if v_target_role in ('owner','admin') and not private.is_platform_privileged() then
    raise exception 'Owner/admin permission overrides are protected';
  end if;

  select permissions into v_before
  from public.member_permission_overrides
  where organization_id=p_organization_id and user_id=p_user_id;

  insert into public.member_permission_overrides(organization_id,user_id,permissions,updated_by,updated_at)
  values (p_organization_id,p_user_id,coalesce(p_permissions,'{}'::jsonb),(select auth.uid()),now())
  on conflict (organization_id,user_id)
  do update set permissions=excluded.permissions,updated_by=excluded.updated_by,updated_at=now();

  perform public.write_audit_event(
    p_organization_id,'permission_change','organization_member',p_user_id::text,'Permission overrides updated',
    null,null,null,coalesce(v_before,'{}'::jsonb),coalesce(p_permissions,'{}'::jsonb),
    jsonb_build_object('target_user_id',p_user_id)
  );
end;
$$;

create or replace function public.set_driver_metric_override(
  p_organization_id uuid,
  p_driver_id uuid,
  p_week_label text,
  p_metric_key text,
  p_override_value numeric,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
declare v_source numeric;
declare v_before jsonb;
declare v_metric_row jsonb;
begin
  if not private.has_workspace_permission(p_organization_id,'edit_scorecards')
     or not private.can_access_driver(p_organization_id,p_driver_id) then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  if p_metric_key not in ('mentor_score','dcr','dsc_dpmo','lor','pod','cc','ce_dpmo','cdf_dpmo','psb','delivered','concessions') then
    raise exception 'Unsupported metric';
  end if;

  select to_jsonb(dm) into v_metric_row
  from public.driver_metrics dm
  where dm.organization_id=p_organization_id and dm.driver_id=p_driver_id and dm.week_label=p_week_label
  order by dm.created_at desc limit 1;

  if v_metric_row is null then raise exception 'Driver metric row not found'; end if;
  v_source := nullif(v_metric_row->>p_metric_key,'')::numeric;

  select jsonb_build_object('override_value',override_value,'reason',reason,'status',status)
  into v_before
  from public.driver_metric_overrides
  where organization_id=p_organization_id and driver_id=p_driver_id and week_label=p_week_label
    and metric_key=p_metric_key and status='active'
  limit 1;

  update public.driver_metric_overrides
  set override_value=p_override_value,reason=p_reason,created_by=(select auth.uid()),created_at=now(),metadata=jsonb_build_object('updated',true)
  where organization_id=p_organization_id and driver_id=p_driver_id and week_label=p_week_label
    and metric_key=p_metric_key and status='active'
  returning id into v_id;

  if v_id is null then
    insert into public.driver_metric_overrides(
      organization_id,driver_id,week_label,metric_key,source_value,override_value,reason,status,created_by
    ) values (
      p_organization_id,p_driver_id,p_week_label,p_metric_key,v_source,p_override_value,p_reason,'active',(select auth.uid())
    ) returning id into v_id;
  end if;

  perform public.write_audit_event(
    p_organization_id,'metric_override','driver_metric_override',v_id::text,
    'Manual metric override set',p_driver_id,null,p_week_label,
    coalesce(v_before,jsonb_build_object('source_value',v_source)),
    jsonb_build_object('metric_key',p_metric_key,'override_value',p_override_value,'reason',p_reason),
    jsonb_build_object('metric_key',p_metric_key)
  );

  return v_id;
end;
$$;

create or replace function public.reset_driver_metric_override(
  p_override_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_row public.driver_metric_overrides%rowtype;
begin
  select * into v_row from public.driver_metric_overrides where id=p_override_id;
  if not found then raise exception 'Override not found'; end if;

  if not private.has_workspace_permission(v_row.organization_id,'reset_overrides')
     or not private.can_access_driver(v_row.organization_id,v_row.driver_id) then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  update public.driver_metric_overrides
  set status='reset',reset_by=(select auth.uid()),reset_at=now(),reset_reason=p_reason
  where id=p_override_id;

  perform public.write_audit_event(
    v_row.organization_id,'metric_override_reset','driver_metric_override',v_row.id::text,
    'Metric override reset to source',v_row.driver_id,null,v_row.week_label,
    jsonb_build_object('metric_key',v_row.metric_key,'override_value',v_row.override_value),
    jsonb_build_object('metric_key',v_row.metric_key,'source_value',v_row.source_value,'reason',p_reason),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.list_metric_overrides(
  p_organization_id uuid,
  p_status text default null
)
returns table(
  id uuid,driver_id uuid,driver_name text,trid text,site text,week_label text,metric_key text,
  source_value numeric,override_value numeric,reason text,status text,created_by uuid,
  created_by_name text,created_at timestamptz,reset_by uuid,reset_at timestamptz,reset_reason text,metadata jsonb
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=(select auth.uid())
  ) and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select o.id,o.driver_id,d.full_name,d.trid,d.site,o.week_label,o.metric_key,o.source_value,o.override_value,
         o.reason,o.status,o.created_by,p.full_name,o.created_at,o.reset_by,o.reset_at,o.reset_reason,o.metadata
  from public.driver_metric_overrides o
  join public.drivers d on d.id=o.driver_id
  left join public.profiles p on p.id=o.created_by
  where o.organization_id=p_organization_id
    and (p_status is null or o.status=p_status)
    and (private.can_access_driver(o.organization_id,o.driver_id) or private.is_platform_privileged())
  order by o.created_at desc;
end;
$$;

create or replace function public.bulk_open_coaching_cases(
  p_organization_id uuid,
  p_driver_ids uuid[],
  p_title text,
  p_reason text default null,
  p_metric text default null,
  p_priority text default 'medium',
  p_week_label text default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare v_driver uuid;
declare v_count integer:=0;
declare v_priority text;
begin
  if not private.has_workspace_permission(p_organization_id,'bulk_actions')
     or not private.has_workspace_permission(p_organization_id,'manage_coaching') then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  v_priority:=case when p_priority in ('low','medium','high','critical') then p_priority else 'medium' end;

  foreach v_driver in array coalesce(p_driver_ids,'{}'::uuid[])
  loop
    if private.can_access_driver(p_organization_id,v_driver) and not exists (
      select 1 from public.coaching_cases c
      where c.organization_id=p_organization_id and c.driver_id=v_driver and c.status<>'closed'
        and c.metadata->>'bulk_week'=coalesce(p_week_label,'')
        and c.title=coalesce(nullif(btrim(p_title),''),'Bulk coaching action')
    ) then
      insert into public.coaching_cases(
        organization_id,driver_id,title,reason,metric,priority,status,created_by,due_at,follow_up_at,metadata
      ) values (
        p_organization_id,v_driver,coalesce(nullif(btrim(p_title),''),'Bulk coaching action'),
        nullif(btrim(p_reason),''),nullif(btrim(p_metric),''),v_priority,'open',(select auth.uid()),
        now()+interval '7 days',now()+interval '7 days',
        jsonb_build_object('source','bulk_action','bulk_week',coalesce(p_week_label,''))
      );
      v_count:=v_count+1;
    end if;
  end loop;

  perform public.write_audit_event(
    p_organization_id,'bulk_coaching','bulk_action',null,'Bulk coaching cases created',
    null,null,p_week_label,'{}'::jsonb,
    jsonb_build_object('requested',cardinality(coalesce(p_driver_ids,'{}'::uuid[])),'created',v_count,'title',p_title),
    jsonb_build_object('driver_ids',to_jsonb(coalesce(p_driver_ids,'{}'::uuid[])))
  );
  return v_count;
end;
$$;

create or replace function public.bulk_mark_drivers_reviewed(
  p_organization_id uuid,
  p_driver_ids uuid[],
  p_week_label text default null,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare v_driver uuid;
declare v_count integer:=0;
begin
  if not private.has_workspace_permission(p_organization_id,'bulk_actions') then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  foreach v_driver in array coalesce(p_driver_ids,'{}'::uuid[])
  loop
    if private.can_access_driver(p_organization_id,v_driver) then
      insert into public.audit_events(
        organization_id,actor_id,event_type,entity_type,entity_id,driver_id,week_label,action,metadata
      ) values (
        p_organization_id,(select auth.uid()),'driver_reviewed','driver',v_driver::text,v_driver,p_week_label,
        'Driver scorecard reviewed',jsonb_build_object('note',p_note)
      );
      v_count:=v_count+1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.write_audit_event(uuid,text,text,text,text,uuid,text,text,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.list_audit_events(uuid,integer) to authenticated;
grant execute on function public.get_my_effective_permissions(uuid) to authenticated;
grant execute on function public.list_workspace_permissions(uuid) to authenticated;
grant execute on function public.update_member_permission_overrides(uuid,uuid,jsonb) to authenticated;
grant execute on function public.set_driver_metric_override(uuid,uuid,text,text,numeric,text) to authenticated;
grant execute on function public.reset_driver_metric_override(uuid,text) to authenticated;
grant execute on function public.list_metric_overrides(uuid,text) to authenticated;
grant execute on function public.bulk_open_coaching_cases(uuid,uuid[],text,text,text,text,text) to authenticated;
grant execute on function public.bulk_mark_drivers_reviewed(uuid,uuid[],text,text) to authenticated;

-- MetrixIQ Operations Intelligence V4
-- Driver 360 V2, Root-Cause Engine, Evidence & Incident Center, Site Operations Center.

create table if not exists public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid null references public.drivers(id) on delete set null,
  site text null,
  week_label text null,
  tracking_id text null,
  incident_type text not null default 'other',
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','investigating','actioned','resolved','closed')),
  title text not null,
  description text null,
  root_cause text null,
  outcome text null,
  source_type text not null default 'manual',
  source_id text null,
  assigned_to uuid null references auth.users(id) on delete set null,
  due_at timestamptz null,
  occurred_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists operational_incidents_org_status_idx
  on public.operational_incidents(organization_id,status,severity,updated_at desc);
create index if not exists operational_incidents_driver_idx
  on public.operational_incidents(driver_id,updated_at desc);
create index if not exists operational_incidents_site_idx
  on public.operational_incidents(organization_id,site,updated_at desc);
create unique index if not exists operational_incidents_source_unique
  on public.operational_incidents(organization_id,source_type,source_id)
  where source_id is not null;

alter table public.operational_incidents enable row level security;
revoke insert, update, delete on public.operational_incidents from authenticated;
grant select on public.operational_incidents to authenticated;

create table if not exists public.incident_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null references public.operational_incidents(id) on delete cascade,
  author_id uuid null references auth.users(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists incident_notes_incident_idx
  on public.incident_notes(incident_id,created_at desc);
alter table public.incident_notes enable row level security;
revoke insert, update, delete on public.incident_notes from authenticated;
grant select on public.incident_notes to authenticated;

create table if not exists public.driver_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  note_type text not null default 'manager',
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists driver_notes_driver_idx
  on public.driver_notes(driver_id,created_at desc);
alter table public.driver_notes enable row level security;
revoke insert, update, delete on public.driver_notes from authenticated;
grant select on public.driver_notes to authenticated;

create or replace function private.permission_defaults(p_role text)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select case lower(coalesce(p_role,'viewer'))
    when 'owner' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,
      'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'admin' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,
      'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'manager' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,
      'manage_team',true,'manage_permissions',false,'view_billing',false
    )
    when 'dispatcher' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'view_site_operations',true,'view_incidents',true,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,
      'manage_team',false,'manage_permissions',false,'view_billing',false
    )
    else jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'view_site_operations',true,'view_incidents',true,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',false,'bulk_actions',false,'manage_incidents',false,
      'manage_team',false,'manage_permissions',false,'view_billing',false
    )
  end;
$$;

drop policy if exists operational_incidents_select on public.operational_incidents;
create policy operational_incidents_select on public.operational_incidents
for select to authenticated
using (
  private.has_workspace_permission(organization_id,'view_incidents')
  and (
    driver_id is null
    or private.can_access_driver(organization_id,driver_id)
    or private.is_platform_privileged()
  )
  and (
    site is null
    or private.can_access_site(organization_id,site)
    or private.is_platform_privileged()
  )
);

drop policy if exists incident_notes_select on public.incident_notes;
create policy incident_notes_select on public.incident_notes
for select to authenticated
using (
  exists (
    select 1
    from public.operational_incidents i
    where i.id=incident_notes.incident_id
      and i.organization_id=incident_notes.organization_id
      and private.has_workspace_permission(i.organization_id,'view_incidents')
      and (i.driver_id is null or private.can_access_driver(i.organization_id,i.driver_id) or private.is_platform_privileged())
  )
);

drop policy if exists driver_notes_select on public.driver_notes;
create policy driver_notes_select on public.driver_notes
for select to authenticated
using (
  private.has_workspace_permission(organization_id,'view_driver_data')
  and (private.can_access_driver(organization_id,driver_id) or private.is_platform_privileged())
);

create or replace function public.list_operational_incidents(
  p_organization_id uuid,
  p_status text default null,
  p_limit integer default 500
)
returns table(
  id uuid,driver_id uuid,driver_name text,trid text,site text,week_label text,tracking_id text,
  incident_type text,severity text,status text,title text,description text,root_cause text,outcome text,
  source_type text,source_id text,assigned_to uuid,assigned_name text,due_at timestamptz,occurred_at timestamptz,
  metadata jsonb,created_by uuid,created_at timestamptz,updated_at timestamptz,resolved_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_incidents')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select i.id,i.driver_id,d.full_name,d.trid,coalesce(i.site,d.site),i.week_label,i.tracking_id,
         i.incident_type,i.severity,i.status,i.title,i.description,i.root_cause,i.outcome,
         i.source_type,i.source_id,i.assigned_to,p.full_name,i.due_at,i.occurred_at,
         i.metadata,i.created_by,i.created_at,i.updated_at,i.resolved_at
  from public.operational_incidents i
  left join public.drivers d on d.id=i.driver_id
  left join public.profiles p on p.id=i.assigned_to
  where i.organization_id=p_organization_id
    and (p_status is null or i.status=p_status)
    and (i.driver_id is null or private.is_platform_privileged() or private.can_access_driver(i.organization_id,i.driver_id))
    and (i.site is null or private.is_platform_privileged() or private.can_access_site(i.organization_id,i.site))
  order by
    case i.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
    case when i.due_at is not null and i.due_at<now() then 0 else 1 end,
    i.updated_at desc
  limit greatest(1,least(coalesce(p_limit,500),2500));
end;
$$;

create or replace function public.list_incident_assignees(p_organization_id uuid)
returns table(user_id uuid,email text,full_name text,role text,site_scope text[])
language plpgsql
security definer
set search_path to ''
as $incident_assignees$
begin
  if not private.has_workspace_permission(p_organization_id,'view_incidents')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select m.user_id,p.email,p.full_name,m.role,coalesce(m.site_scope,'{}'::text[])
  from public.organization_members m
  left join public.profiles p on p.id=m.user_id
  where m.organization_id=p_organization_id
    and m.role in ('owner','admin','manager','dispatcher')
  order by case m.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end,
           coalesce(p.full_name,p.email,'');
end;
$incident_assignees$;

create or replace function public.create_operational_incident(
  p_organization_id uuid,
  p_driver_id uuid default null,
  p_site text default null,
  p_week_label text default null,
  p_tracking_id text default null,
  p_incident_type text default 'other',
  p_severity text default 'medium',
  p_title text default 'Operational incident',
  p_description text default null,
  p_source_type text default 'manual',
  p_source_id text default null,
  p_occurred_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_site text;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_incidents')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if p_driver_id is not null
     and not private.is_platform_privileged()
     and not private.can_access_driver(p_organization_id,p_driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;

  if p_severity not in ('low','medium','high','critical') then raise exception 'Invalid severity'; end if;
  if p_incident_type not in ('dnr','cdf','pod','failed_delivery','customer_escalation','contact_compliance','route_failure','safety','vehicle','other') then
    raise exception 'Invalid incident type';
  end if;

  select d.site into v_site
  from public.drivers d
  where d.organization_id=p_organization_id and d.id=p_driver_id;

  insert into public.operational_incidents(
    organization_id,driver_id,site,week_label,tracking_id,incident_type,severity,status,
    title,description,source_type,source_id,occurred_at,metadata,created_by
  ) values (
    p_organization_id,p_driver_id,
    coalesce(nullif(upper(btrim(coalesce(p_site,''))),''),v_site),
    nullif(btrim(coalesce(p_week_label,'')),''),
    nullif(btrim(coalesce(p_tracking_id,'')),''),
    p_incident_type,p_severity,'open',
    coalesce(nullif(btrim(p_title),''),'Operational incident'),
    nullif(btrim(coalesce(p_description,'')),''),
    coalesce(nullif(btrim(p_source_type),''),'manual'),
    nullif(btrim(coalesce(p_source_id,'')),''),
    coalesce(p_occurred_at,now()),
    coalesce(p_metadata,'{}'::jsonb),
    (select auth.uid())
  )
  on conflict (organization_id,source_type,source_id)
  where source_id is not null
  do update set
    title=excluded.title,
    description=coalesce(excluded.description,public.operational_incidents.description),
    severity=excluded.severity,
    updated_at=now()
  returning id into v_id;

  perform public.write_audit_event(
    p_organization_id,'incident_created','operational_incident',v_id::text,'Operational incident created',
    p_driver_id,coalesce(nullif(upper(btrim(coalesce(p_site,''))),''),v_site),p_week_label,
    '{}'::jsonb,
    jsonb_build_object('title',p_title,'incident_type',p_incident_type,'severity',p_severity,'tracking_id',p_tracking_id),
    jsonb_build_object('source_type',p_source_type,'source_id',p_source_id)
  );

  return v_id;
end;
$$;

create or replace function public.update_operational_incident(
  p_incident_id uuid,
  p_status text default null,
  p_severity text default null,
  p_assigned_to uuid default null,
  p_due_at timestamptz default null,
  p_root_cause text default null,
  p_outcome text default null,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row public.operational_incidents%rowtype;
  v_before jsonb;
begin
  select * into v_row from public.operational_incidents where id=p_incident_id;
  if not found then raise exception 'Incident not found'; end if;

  if not private.has_workspace_permission(v_row.organization_id,'manage_incidents')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if v_row.driver_id is not null
     and not private.is_platform_privileged()
     and not private.can_access_driver(v_row.organization_id,v_row.driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;

  if p_status is not null and p_status not in ('open','investigating','actioned','resolved','closed') then
    raise exception 'Invalid status';
  end if;
  if p_severity is not null and p_severity not in ('low','medium','high','critical') then
    raise exception 'Invalid severity';
  end if;

  v_before:=to_jsonb(v_row);

  update public.operational_incidents
  set status=coalesce(p_status,status),
      severity=coalesce(p_severity,severity),
      assigned_to=case when p_assigned_to is not null then p_assigned_to else assigned_to end,
      due_at=coalesce(p_due_at,due_at),
      root_cause=coalesce(nullif(btrim(coalesce(p_root_cause,'')),''),root_cause),
      outcome=coalesce(nullif(btrim(coalesce(p_outcome,'')),''),outcome),
      description=coalesce(nullif(btrim(coalesce(p_description,'')),''),description),
      resolved_at=case
        when coalesce(p_status,status) in ('resolved','closed') then coalesce(resolved_at,now())
        when p_status is not null then null
        else resolved_at
      end,
      updated_at=now()
  where id=p_incident_id;

  perform public.write_audit_event(
    v_row.organization_id,'incident_updated','operational_incident',p_incident_id::text,'Operational incident updated',
    v_row.driver_id,v_row.site,v_row.week_label,v_before,
    (select to_jsonb(i) from public.operational_incidents i where i.id=p_incident_id),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.add_incident_note(p_incident_id uuid,p_note text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_incident public.operational_incidents%rowtype;
  v_id uuid;
begin
  select * into v_incident from public.operational_incidents where id=p_incident_id;
  if not found then raise exception 'Incident not found'; end if;

  if not private.has_workspace_permission(v_incident.organization_id,'manage_incidents')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  if btrim(coalesce(p_note,''))='' then raise exception 'Note is required'; end if;

  insert into public.incident_notes(organization_id,incident_id,author_id,note)
  values(v_incident.organization_id,p_incident_id,(select auth.uid()),btrim(p_note))
  returning id into v_id;

  update public.operational_incidents set updated_at=now() where id=p_incident_id;

  perform public.write_audit_event(
    v_incident.organization_id,'incident_note','operational_incident',p_incident_id::text,'Incident note added',
    v_incident.driver_id,v_incident.site,v_incident.week_label,'{}'::jsonb,
    jsonb_build_object('note_id',v_id),
    '{}'::jsonb
  );

  return v_id;
end;
$$;

create or replace function public.list_incident_notes(p_incident_id uuid)
returns table(
  id uuid,note text,author_id uuid,author_name text,author_email text,created_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
declare v_incident public.operational_incidents%rowtype;
begin
  select * into v_incident from public.operational_incidents where operational_incidents.id=p_incident_id;
  if not found then raise exception 'Incident not found'; end if;

  if not private.has_workspace_permission(v_incident.organization_id,'view_incidents')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select n.id,n.note,n.author_id,p.full_name,p.email,n.created_at
  from public.incident_notes n
  left join public.profiles p on p.id=n.author_id
  where n.incident_id=p_incident_id
  order by n.created_at desc;
end;
$$;

create or replace function public.create_incident_from_feedback(
  p_organization_id uuid,
  p_feedback_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_event public.feedback_events%rowtype;
  v_type text;
  v_title text;
  v_severity text;
  v_description text;
  v_id uuid;
begin
  select * into v_event
  from public.feedback_events
  where id=p_feedback_id and organization_id=p_organization_id;
  if not found then raise exception 'Feedback evidence not found'; end if;

  if not private.has_workspace_permission(p_organization_id,'manage_incidents')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  v_type:=case
    when v_event.dnr_concession then 'dnr'
    when lower(coalesce(v_event.contact_compliance,'')) like '%fail%' then 'contact_compliance'
    else 'cdf'
  end;
  v_severity:=case when v_event.dnr_concession then 'high' else 'medium' end;
  v_title:=coalesce(v_event.feedback_l2,v_event.feedback_l1,v_event.feedback_l0,'Customer feedback investigation');
  v_description:=concat_ws(' · ',
    nullif(v_event.feedback_l0,''),
    nullif(v_event.feedback_l1,''),
    nullif(v_event.feedback_l2,''),
    case when v_event.scanned_over_25m then 'Scan over 25m' else null end,
    case when v_event.dnr_concession then 'DNR concession' else null end
  );

  select public.create_operational_incident(
    p_organization_id,
    v_event.driver_id,
    v_event.site,
    v_event.week_label,
    v_event.tracking_id,
    v_type,
    v_severity,
    v_title,
    v_description,
    'feedback_event',
    v_event.id::text,
    coalesce(v_event.delivery_time,v_event.feedback_date::timestamptz,v_event.created_at),
    jsonb_build_object(
      'feedback_l0',v_event.feedback_l0,
      'feedback_l1',v_event.feedback_l1,
      'feedback_l2',v_event.feedback_l2,
      'contact_compliance',v_event.contact_compliance,
      'phr_compliance',v_event.phr_compliance,
      'scanned_over_25m',v_event.scanned_over_25m,
      'dnr_concession',v_event.dnr_concession
    )
  ) into v_id;

  return v_id;
end;
$$;

create or replace function public.add_driver_note(
  p_organization_id uuid,
  p_driver_id uuid,
  p_note text,
  p_note_type text default 'manager'
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
declare v_site text;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_coaching')
     and not private.has_workspace_permission(p_organization_id,'manage_incidents')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if not private.is_platform_privileged() and not private.can_access_driver(p_organization_id,p_driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;
  if btrim(coalesce(p_note,''))='' then raise exception 'Note is required'; end if;

  select site into v_site from public.drivers where id=p_driver_id and organization_id=p_organization_id;

  insert into public.driver_notes(organization_id,driver_id,created_by,note_type,note)
  values(p_organization_id,p_driver_id,(select auth.uid()),coalesce(nullif(btrim(p_note_type),''),'manager'),btrim(p_note))
  returning id into v_id;

  perform public.write_audit_event(
    p_organization_id,'driver_note','driver',p_driver_id::text,'Driver note added',
    p_driver_id,v_site,null,'{}'::jsonb,jsonb_build_object('note_id',v_id,'note_type',p_note_type),'{}'::jsonb
  );

  return v_id;
end;
$$;

create or replace function public.list_driver_notes(
  p_organization_id uuid,
  p_driver_id uuid,
  p_limit integer default 200
)
returns table(
  id uuid,driver_id uuid,note text,note_type text,created_by uuid,author_name text,author_email text,created_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_driver_data')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if not private.is_platform_privileged() and not private.can_access_driver(p_organization_id,p_driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;

  return query
  select n.id,n.driver_id,n.note,n.note_type,n.created_by,p.full_name,p.email,n.created_at
  from public.driver_notes n
  left join public.profiles p on p.id=n.created_by
  where n.organization_id=p_organization_id and n.driver_id=p_driver_id
  order by n.created_at desc
  limit greatest(1,least(coalesce(p_limit,200),1000));
end;
$$;

grant execute on function public.list_operational_incidents(uuid,text,integer) to authenticated;
grant execute on function public.list_incident_assignees(uuid) to authenticated;
grant execute on function public.create_operational_incident(uuid,uuid,text,text,text,text,text,text,text,text,text,timestamptz,jsonb) to authenticated;
grant execute on function public.update_operational_incident(uuid,text,text,uuid,timestamptz,text,text,text) to authenticated;
grant execute on function public.add_incident_note(uuid,text) to authenticated;
grant execute on function public.list_incident_notes(uuid) to authenticated;
grant execute on function public.create_incident_from_feedback(uuid,uuid) to authenticated;
grant execute on function public.add_driver_note(uuid,uuid,text,text) to authenticated;
grant execute on function public.list_driver_notes(uuid,uuid,integer) to authenticated;

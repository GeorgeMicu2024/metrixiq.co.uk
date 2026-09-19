-- MetrixIQ Platform & Mobile V6
-- Integration configuration, data freshness and reliability checks.

create table if not exists public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_key text not null,
  enabled boolean not null default true,
  expected_frequency_hours integer not null default 168 check (expected_frequency_hours between 1 and 8760),
  criticality text not null default 'medium' check (criticality in ('low','medium','high','critical')),
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,source_key)
);

create index if not exists integration_configs_org_idx
  on public.integration_configs(organization_id,source_key);

alter table public.integration_configs enable row level security;
revoke insert, update, delete on public.integration_configs from authenticated;
grant select on public.integration_configs to authenticated;

create table if not exists public.reliability_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  overall_status text not null default 'unknown' check (overall_status in ('healthy','warning','critical','unknown')),
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists reliability_checks_org_created_idx
  on public.reliability_checks(organization_id,created_at desc);

alter table public.reliability_checks enable row level security;
revoke insert, update, delete on public.reliability_checks from authenticated;
grant select on public.reliability_checks to authenticated;

create or replace function private.permission_defaults(p_role text)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select case lower(coalesce(p_role,'viewer'))
    when 'owner' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,'view_integrations',true,'view_reliability',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'admin' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,'view_integrations',true,'view_reliability',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'manager' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,'view_integrations',true,'view_reliability',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_team',true,'manage_permissions',false,'view_billing',false
    )
    when 'dispatcher' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'view_site_operations',true,'view_incidents',true,'view_integrations',false,'view_reliability',false,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',false,'run_reliability_checks',false,
      'manage_team',false,'manage_permissions',false,'view_billing',false
    )
    else jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'view_site_operations',true,'view_incidents',true,'view_integrations',false,'view_reliability',false,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',false,'bulk_actions',false,'manage_incidents',false,'manage_integrations',false,'run_reliability_checks',false,
      'manage_team',false,'manage_permissions',false,'view_billing',false
    )
  end;
$$;

drop policy if exists integration_configs_select on public.integration_configs;
create policy integration_configs_select on public.integration_configs
for select to authenticated
using (
  private.has_workspace_permission(organization_id,'view_integrations')
  or private.is_platform_privileged()
);

drop policy if exists reliability_checks_select on public.reliability_checks;
create policy reliability_checks_select on public.reliability_checks
for select to authenticated
using (
  private.has_workspace_permission(organization_id,'view_reliability')
  or private.is_platform_privileged()
);

create or replace function public.list_integration_health(p_organization_id uuid)
returns table(
  source_key text,
  label text,
  category text,
  enabled boolean,
  criticality text,
  expected_frequency_hours integer,
  last_imported_at timestamptz,
  last_period_end date,
  import_count bigint,
  last_status text,
  age_hours numeric,
  freshness_status text,
  metadata jsonb
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_integrations')
     and not private.has_workspace_permission(p_organization_id,'view_reliability')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  with defaults(source_key,label,category,pattern,default_hours,default_criticality,default_meta) as (
    values
      ('scorecard','DSP Scorecard','scorecards','scorecard',240,'critical',jsonb_build_object('destination','driver-scorecards','description','Weekly driver and site scorecard evidence')),
      ('mentor','eMentor / FICO','daily','(^|[^a-z_])mentor([^a-z_]|$)',48,'critical',jsonb_build_object('destination','mentor','description','Daily / weekly eMentor safety score')),
      ('iadc','IADC','weekly','iadc',240,'high',jsonb_build_object('destination','iadc','description','Delivery workflow compliance')),
      ('cdf','CDF','weekly','(^|[^a-z])cdf([^a-z]|$)',336,'high',jsonb_build_object('destination','cdf','description','Customer delivery feedback')),
      ('concessions','Concessions','weekly','concessions',240,'high',jsonb_build_object('destination','concessions','description','DNR / concession evidence')),
      ('driver_master','Driver Master','identity','identity_master|mentor_alias_master',240,'critical',jsonb_build_object('destination','data-quality','description','TRID and driver identity mapping')),
      ('daily_report','Daily Operations','daily','daily_report',48,'medium',jsonb_build_object('destination','performance','description','Daily operational reporting')),
      ('pod','POD','weekly','(^|[^a-z])pod([^a-z]|$)',240,'high',jsonb_build_object('destination','performance','description','Proof of delivery performance')),
      ('contact_compliance','Contact Compliance','weekly','contact_compliance',240,'medium',jsonb_build_object('destination','performance','description','Customer contact workflow')),
      ('customer_escalation','Customer Escalation','weekly','customer_escalation',240,'high',jsonb_build_object('destination','evidence','description','Customer escalation evidence'))
  ),
  config as (
    select d.source_key,d.label,d.category,d.pattern,
           coalesce(c.expected_frequency_hours,d.default_hours) as expected_hours,
           coalesce(c.criticality,d.default_criticality) as criticality,
           coalesce(c.enabled,true) as enabled,
           d.default_meta || coalesce(c.metadata,'{}'::jsonb) as metadata
    from defaults d
    left join public.integration_configs c
      on c.organization_id=p_organization_id and c.source_key=d.source_key
  ),
  agg as (
    select c.source_key,
           max(i.created_at) as last_imported_at,
           max(i.period_end) as last_period_end,
           count(i.id) as import_count,
           (array_agg(i.status order by i.created_at desc) filter (where i.id is not null))[1] as last_status
    from config c
    left join public.imports i
      on i.organization_id=p_organization_id
     and lower(coalesce(i.detected_report_type,'')) ~ c.pattern
     and coalesce((i.metadata->>'rolled_back')::boolean,false)=false
    group by c.source_key
  )
  select
    c.source_key,c.label,c.category,c.enabled,c.criticality,c.expected_hours,
    a.last_imported_at,a.last_period_end,coalesce(a.import_count,0),
    coalesce(a.last_status,'missing'),
    case
      when coalesce(a.last_period_end::timestamptz,a.last_imported_at) is null then null
      else round(extract(epoch from (now()-coalesce(a.last_period_end::timestamptz,a.last_imported_at)))/3600.0,1)
    end as age_hours,
    case
      when not c.enabled then 'disabled'
      when coalesce(a.last_period_end::timestamptz,a.last_imported_at) is null then 'missing'
      when now()-coalesce(a.last_period_end::timestamptz,a.last_imported_at) <= make_interval(hours=>c.expected_hours) then 'fresh'
      when now()-coalesce(a.last_period_end::timestamptz,a.last_imported_at) <= make_interval(hours=>round(c.expected_hours*1.5)::integer) then 'warning'
      else 'stale'
    end as freshness_status,
    c.metadata
  from config c
  left join agg a on a.source_key=c.source_key
  order by
    case c.criticality when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
    c.label;
end;
$$;

create or replace function public.update_integration_config(
  p_organization_id uuid,
  p_source_key text,
  p_enabled boolean default null,
  p_expected_frequency_hours integer default null,
  p_criticality text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'manage_integrations')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  if p_expected_frequency_hours is not null and (p_expected_frequency_hours < 1 or p_expected_frequency_hours > 8760) then
    raise exception 'Invalid expected frequency';
  end if;
  if p_criticality is not null and p_criticality not in ('low','medium','high','critical') then
    raise exception 'Invalid criticality';
  end if;

  insert into public.integration_configs(
    organization_id,source_key,enabled,expected_frequency_hours,criticality,updated_by
  ) values (
    p_organization_id,btrim(lower(p_source_key)),coalesce(p_enabled,true),
    coalesce(p_expected_frequency_hours,168),coalesce(p_criticality,'medium'),(select auth.uid())
  )
  on conflict (organization_id,source_key) do update
  set enabled=coalesce(p_enabled,public.integration_configs.enabled),
      expected_frequency_hours=coalesce(p_expected_frequency_hours,public.integration_configs.expected_frequency_hours),
      criticality=coalesce(p_criticality,public.integration_configs.criticality),
      updated_by=(select auth.uid()),
      updated_at=now();

  perform public.write_audit_event(
    p_organization_id,'integration_config_updated','integration_config',btrim(lower(p_source_key)),
    'Integration freshness configuration updated',
    null,null,null,'{}'::jsonb,
    jsonb_build_object(
      'enabled',p_enabled,
      'expected_frequency_hours',p_expected_frequency_hours,
      'criticality',p_criticality
    ),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.get_reliability_snapshot(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_stale integer:=0;
  v_stale_critical integer:=0;
  v_missing integer:=0;
  v_failed_imports integer:=0;
  v_unmatched integer:=0;
  v_unread integer:=0;
  v_critical_notifications integer:=0;
  v_overdue_tasks integer:=0;
  v_open_incidents integer:=0;
  v_last_import timestamptz;
  v_last_report timestamptz;
  v_last_check timestamptz;
begin
  if not private.has_workspace_permission(p_organization_id,'view_reliability')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  select
    count(*) filter (where freshness_status='stale'),
    count(*) filter (where freshness_status in ('stale','missing') and criticality='critical'),
    count(*) filter (where freshness_status='missing')
  into v_stale,v_stale_critical,v_missing
  from public.list_integration_health(p_organization_id);

  select count(*) into v_failed_imports
  from public.imports
  where organization_id=p_organization_id
    and status='failed'
    and created_at>=now()-interval '7 days'
    and coalesce((metadata->>'rolled_back')::boolean,false)=false;

  select count(*) into v_unmatched
  from public.unmatched_driver_records
  where organization_id=p_organization_id and status='open';

  select
    count(*) filter (where status='unread'),
    count(*) filter (where status not in ('reviewed','dismissed') and severity='critical')
  into v_unread,v_critical_notifications
  from public.notification_events
  where organization_id=p_organization_id;

  select count(*) into v_overdue_tasks
  from public.manager_tasks
  where organization_id=p_organization_id
    and status in ('open','in_progress')
    and due_at is not null and due_at<now();

  select count(*) into v_open_incidents
  from public.operational_incidents
  where organization_id=p_organization_id and status not in ('resolved','closed');

  select max(created_at) into v_last_import from public.imports where organization_id=p_organization_id;
  select max(created_at) into v_last_report from public.report_snapshots where organization_id=p_organization_id;
  select max(created_at) into v_last_check from public.reliability_checks where organization_id=p_organization_id;

  return jsonb_build_object(
    'database_status','healthy',
    'database_time',now(),
    'stale_sources',v_stale,
    'stale_critical_sources',v_stale_critical,
    'missing_sources',v_missing,
    'failed_imports_7d',v_failed_imports,
    'unmatched_open',v_unmatched,
    'unread_notifications',v_unread,
    'critical_notifications',v_critical_notifications,
    'overdue_manager_tasks',v_overdue_tasks,
    'open_incidents',v_open_incidents,
    'last_import_at',v_last_import,
    'last_report_at',v_last_report,
    'last_reliability_check_at',v_last_check
  );
end;
$$;

create or replace function public.save_reliability_check(
  p_organization_id uuid,
  p_overall_status text,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not private.has_workspace_permission(p_organization_id,'run_reliability_checks')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if p_overall_status not in ('healthy','warning','critical','unknown') then
    raise exception 'Invalid reliability status';
  end if;

  insert into public.reliability_checks(organization_id,overall_status,snapshot,created_by)
  values(p_organization_id,p_overall_status,coalesce(p_snapshot,'{}'::jsonb),(select auth.uid()))
  returning id into v_id;

  perform public.write_audit_event(
    p_organization_id,'reliability_check','reliability_check',v_id::text,
    'Platform reliability check recorded',
    null,null,null,'{}'::jsonb,
    jsonb_build_object('overall_status',p_overall_status),
    coalesce(p_snapshot,'{}'::jsonb)
  );

  return v_id;
end;
$$;

create or replace function public.list_reliability_checks(
  p_organization_id uuid,
  p_limit integer default 50
)
returns table(
  id uuid,
  overall_status text,
  snapshot jsonb,
  created_by uuid,
  created_by_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_reliability')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select r.id,r.overall_status,r.snapshot,r.created_by,p.full_name,r.created_at
  from public.reliability_checks r
  left join public.profiles p on p.id=r.created_by
  where r.organization_id=p_organization_id
  order by r.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),500));
end;
$$;

grant execute on function public.list_integration_health(uuid) to authenticated;
grant execute on function public.update_integration_config(uuid,text,boolean,integer,text) to authenticated;
grant execute on function public.get_reliability_snapshot(uuid) to authenticated;
grant execute on function public.save_reliability_check(uuid,text,jsonb) to authenticated;
grant execute on function public.list_reliability_checks(uuid,integer) to authenticated;

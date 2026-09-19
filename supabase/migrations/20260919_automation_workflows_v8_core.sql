-- MetrixIQ Automation & Workflow Engine V8 - Core
-- Rules, playbooks, approvals, SLA policies, routing and auditable workflow state.

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text null,
  enabled boolean not null default false,
  site text null,
  trigger_type text not null check (trigger_type in (
    'fico_below','total_score_below','concessions_above','dcr_wow_drop',
    'stale_source','overdue_coaching','overdue_incident','scheduled_digest'
  )),
  condition_config jsonb not null default '{}'::jsonb,
  action_type text not null check (action_type in (
    'manager_task','notification','coaching','incident','playbook','approval'
  )),
  action_config jsonb not null default '{}'::jsonb,
  schedule_mode text not null default 'event' check (schedule_mode in ('event','manual','daily','weekly')),
  schedule_day integer null check (schedule_day between 0 and 6),
  schedule_hour integer null check (schedule_hour between 0 and 23),
  next_run_at timestamptz null,
  last_run_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name)
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid null references public.automation_rules(id) on delete set null,
  status text not null default 'running' check (status in ('running','succeeded','failed','skipped')),
  matched_count integer not null default 0,
  action_count integer not null default 0,
  error_message text null,
  context jsonb not null default '{}'::jsonb,
  triggered_by uuid null references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null
);

create table if not exists public.workflow_playbooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  playbook_key text not null,
  name text not null,
  description text null,
  category text not null default 'operations',
  enabled boolean not null default true,
  built_in boolean not null default false,
  steps jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,playbook_key)
);

create table if not exists public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  playbook_id uuid not null references public.workflow_playbooks(id) on delete restrict,
  driver_id uuid null references public.drivers(id) on delete set null,
  site text null,
  week_label text null,
  title text not null,
  status text not null default 'open' check (status in ('open','in_progress','waiting_approval','completed','cancelled')),
  current_step integer not null default 0,
  assigned_to uuid null references auth.users(id) on delete set null,
  due_at timestamptz null,
  completed_at timestamptz null,
  source_type text null,
  source_id text null,
  dedupe_key text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists workflow_instances_dedupe_idx
  on public.workflow_instances(organization_id,dedupe_key)
  where dedupe_key is not null;

create table if not exists public.workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  step_key text not null,
  step_order integer not null,
  title text not null,
  step_type text not null default 'action' check (step_type in ('review','action','coaching','evidence','approval','follow_up','verify')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_approval','completed','skipped','cancelled')),
  assigned_to uuid null references auth.users(id) on delete set null,
  due_at timestamptz null,
  completed_at timestamptz null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_instance_id,step_order)
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_instance_id uuid null references public.workflow_instances(id) on delete cascade,
  workflow_step_id uuid null references public.workflow_step_runs(id) on delete cascade,
  driver_id uuid null references public.drivers(id) on delete set null,
  site text null,
  entity_type text not null,
  entity_id text null,
  request_type text not null,
  title text not null,
  detail text null,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  dedupe_key text null,
  requested_by uuid null references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  decision_note text null,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists approval_requests_dedupe_idx
  on public.approval_requests(organization_id,dedupe_key)
  where dedupe_key is not null;

create table if not exists public.workflow_sla_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site text null,
  entity_type text not null check (entity_type in ('manager_task','coaching','incident','approval','workflow')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical','any')),
  acknowledgement_hours integer not null default 24 check (acknowledgement_hours between 1 and 720),
  resolution_hours integer not null default 168 check (resolution_hours between 1 and 2160),
  escalation_hours integer not null default 24 check (escalation_hours between 1 and 720),
  enabled boolean not null default true,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists workflow_sla_policy_scope_idx
  on public.workflow_sla_policies(organization_id,coalesce(site,'*'),entity_type,priority);

create table if not exists public.workflow_notification_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null,
  minimum_severity text not null default 'medium' check (minimum_severity in ('info','low','medium','high','critical')),
  channel text not null default 'in_app' check (channel in ('in_app','email_digest','whatsapp_summary')),
  recipient_role text not null default 'manager' check (recipient_role in ('owner','admin','manager','dispatcher')),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists workflow_notification_route_unique
  on public.workflow_notification_routes(organization_id,category,channel,recipient_role);

create table if not exists public.workflow_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  route_id uuid null references public.workflow_notification_routes(id) on delete set null,
  channel text not null check (channel in ('email_digest','whatsapp_summary')),
  category text not null,
  severity text not null,
  title text not null,
  message text null,
  driver_id uuid null references public.drivers(id) on delete set null,
  site text null,
  status text not null default 'queued' check (status in ('queued','prepared','sent','failed','cancelled')),
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz null,
  unique (organization_id,dedupe_key,channel)
);

create index if not exists automation_rules_org_enabled_idx on public.automation_rules(organization_id,enabled,trigger_type);
create index if not exists automation_runs_org_started_idx on public.automation_runs(organization_id,started_at desc);
create index if not exists workflow_instances_org_status_idx on public.workflow_instances(organization_id,status,due_at);
create index if not exists workflow_step_runs_instance_idx on public.workflow_step_runs(workflow_instance_id,step_order);
create index if not exists approval_requests_org_status_idx on public.approval_requests(organization_id,status,requested_at desc);
create index if not exists workflow_delivery_queue_org_status_idx on public.workflow_delivery_queue(organization_id,status,created_at desc);

alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
alter table public.workflow_playbooks enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_step_runs enable row level security;
alter table public.approval_requests enable row level security;
alter table public.workflow_sla_policies enable row level security;
alter table public.workflow_notification_routes enable row level security;
alter table public.workflow_delivery_queue enable row level security;

revoke insert,update,delete on public.automation_rules from authenticated;
revoke insert,update,delete on public.automation_runs from authenticated;
revoke insert,update,delete on public.workflow_playbooks from authenticated;
revoke insert,update,delete on public.workflow_instances from authenticated;
revoke insert,update,delete on public.workflow_step_runs from authenticated;
revoke insert,update,delete on public.approval_requests from authenticated;
revoke insert,update,delete on public.workflow_sla_policies from authenticated;
revoke insert,update,delete on public.workflow_notification_routes from authenticated;
revoke insert,update,delete on public.workflow_delivery_queue from authenticated;

grant select on public.automation_rules,public.automation_runs,public.workflow_playbooks,
  public.workflow_instances,public.workflow_step_runs,public.approval_requests,
  public.workflow_sla_policies,public.workflow_notification_routes,public.workflow_delivery_queue
to authenticated;

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
      'view_portfolio',true,'view_enterprise_settings',true,'view_workflows',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_portfolio',true,'manage_kpi_policy',true,'manage_branding',true,
      'manage_automations',true,'manage_workflows',true,'approve_workflows',true,
      'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'admin' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,'view_integrations',true,'view_reliability',true,
      'view_portfolio',true,'view_enterprise_settings',true,'view_workflows',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_portfolio',true,'manage_kpi_policy',true,'manage_branding',true,
      'manage_automations',true,'manage_workflows',true,'approve_workflows',true,
      'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'manager' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,'view_integrations',true,'view_reliability',true,
      'view_portfolio',true,'view_enterprise_settings',true,'view_workflows',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_portfolio',false,'manage_kpi_policy',true,'manage_branding',true,
      'manage_automations',true,'manage_workflows',true,'approve_workflows',true,
      'manage_team',true,'manage_permissions',false,'view_billing',false
    )
    when 'dispatcher' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'view_site_operations',true,'view_incidents',true,'view_integrations',false,'view_reliability',false,
      'view_portfolio',false,'view_enterprise_settings',false,'view_workflows',true,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',false,'run_reliability_checks',false,
      'manage_portfolio',false,'manage_kpi_policy',false,'manage_branding',false,
      'manage_automations',false,'manage_workflows',true,'approve_workflows',false,
      'manage_team',false,'manage_permissions',false,'view_billing',false
    )
    else jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'view_site_operations',true,'view_incidents',true,'view_integrations',false,'view_reliability',false,
      'view_portfolio',false,'view_enterprise_settings',false,'view_workflows',false,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',false,'bulk_actions',false,'manage_incidents',false,'manage_integrations',false,'run_reliability_checks',false,
      'manage_portfolio',false,'manage_kpi_policy',false,'manage_branding',false,
      'manage_automations',false,'manage_workflows',false,'approve_workflows',false,
      'manage_team',false,'manage_permissions',false,'view_billing',false
    )
  end;
$$;

drop policy if exists automation_rules_select on public.automation_rules;
create policy automation_rules_select on public.automation_rules for select to authenticated
using (private.has_workspace_permission(organization_id,'view_workflows') or private.is_platform_privileged());

drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs for select to authenticated
using (private.has_workspace_permission(organization_id,'view_workflows') or private.is_platform_privileged());

drop policy if exists workflow_playbooks_select on public.workflow_playbooks;
create policy workflow_playbooks_select on public.workflow_playbooks for select to authenticated
using (private.has_workspace_permission(organization_id,'view_workflows') or private.is_platform_privileged());

drop policy if exists workflow_instances_select on public.workflow_instances;
create policy workflow_instances_select on public.workflow_instances for select to authenticated
using (
  (private.has_workspace_permission(organization_id,'view_workflows') or private.is_platform_privileged())
  and (driver_id is null or private.can_access_driver(organization_id,driver_id) or private.is_platform_privileged())
  and (site is null or private.can_access_site(organization_id,site) or private.is_platform_privileged())
);

drop policy if exists workflow_step_runs_select on public.workflow_step_runs;
create policy workflow_step_runs_select on public.workflow_step_runs for select to authenticated
using (
  exists (
    select 1 from public.workflow_instances w
    where w.id=workflow_step_runs.workflow_instance_id
      and (private.has_workspace_permission(w.organization_id,'view_workflows') or private.is_platform_privileged())
      and (w.driver_id is null or private.can_access_driver(w.organization_id,w.driver_id) or private.is_platform_privileged())
  )
);

drop policy if exists approval_requests_select on public.approval_requests;
create policy approval_requests_select on public.approval_requests for select to authenticated
using (
  (private.has_workspace_permission(organization_id,'view_workflows') or private.is_platform_privileged())
  and (driver_id is null or private.can_access_driver(organization_id,driver_id) or private.is_platform_privileged())
);

drop policy if exists workflow_sla_policies_select on public.workflow_sla_policies;
create policy workflow_sla_policies_select on public.workflow_sla_policies for select to authenticated
using (private.has_workspace_permission(organization_id,'view_workflows') or private.is_platform_privileged());

drop policy if exists workflow_notification_routes_select on public.workflow_notification_routes;
create policy workflow_notification_routes_select on public.workflow_notification_routes for select to authenticated
using (private.has_workspace_permission(organization_id,'view_workflows') or private.is_platform_privileged());

drop policy if exists workflow_delivery_queue_select on public.workflow_delivery_queue;
create policy workflow_delivery_queue_select on public.workflow_delivery_queue for select to authenticated
using (private.has_workspace_permission(organization_id,'view_workflows') or private.is_platform_privileged());

create or replace function private.next_automation_time(
  p_mode text,
  p_day integer,
  p_hour integer,
  p_from timestamptz default now()
)
returns timestamptz
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_base timestamptz;
  v_days integer;
begin
  if p_mode='daily' then
    v_base:=date_trunc('day',p_from)+make_interval(hours=>coalesce(p_hour,8));
    if v_base<=p_from then v_base:=v_base+interval '1 day'; end if;
    return v_base;
  elsif p_mode='weekly' then
    v_base:=date_trunc('day',p_from)+make_interval(hours=>coalesce(p_hour,8));
    v_days:=mod(coalesce(p_day,1)-extract(dow from v_base)::integer+7,7);
    v_base:=v_base+make_interval(days=>v_days);
    if v_base<=p_from then v_base:=v_base+interval '7 days'; end if;
    return v_base;
  end if;
  return null;
end;
$$;

create or replace function public.ensure_default_workflow_config(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_workflows')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  insert into public.workflow_playbooks(
    organization_id,playbook_key,name,description,category,enabled,built_in,steps,metadata
  ) values
  (
    p_organization_id,'fico_recovery','FICO Recovery',
    'Detect safety-score weakness, review evidence, coach, follow up and verify the next scorecard.',
    'performance',true,true,
    '[
      {"key":"review","title":"Review FICO evidence","type":"review","due_hours":24},
      {"key":"coach","title":"Complete driver coaching","type":"coaching","due_hours":48},
      {"key":"follow_up","title":"Follow up with driver","type":"follow_up","due_hours":120},
      {"key":"verify","title":"Verify next scorecard improvement","type":"verify","due_hours":240},
      {"key":"close_approval","title":"Manager closure approval","type":"approval","due_hours":48}
    ]'::jsonb,
    '{"metric":"mentor","target":815}'::jsonb
  ),
  (
    p_organization_id,'dnr_investigation','DNR Investigation',
    'Review delivery evidence, driver context and root cause before closing a DNR investigation.',
    'evidence',true,true,
    '[
      {"key":"evidence","title":"Review POD, contact and location evidence","type":"evidence","due_hours":24},
      {"key":"driver_statement","title":"Record driver statement","type":"review","due_hours":48},
      {"key":"root_cause","title":"Confirm root cause and corrective action","type":"action","due_hours":72},
      {"key":"coach","title":"Complete coaching if required","type":"coaching","due_hours":120},
      {"key":"close_approval","title":"Approve investigation closure","type":"approval","due_hours":48}
    ]'::jsonb,
    '{"category":"dnr"}'::jsonb
  ),
  (
    p_organization_id,'poor_performance','Poor Performance Recovery',
    'Structured two-week performance recovery with evidence review, coaching, target setting and escalation.',
    'performance',true,true,
    '[
      {"key":"review","title":"Review two-week scorecard trend","type":"review","due_hours":24},
      {"key":"target","title":"Set recovery target","type":"action","due_hours":48},
      {"key":"coach","title":"Complete formal coaching","type":"coaching","due_hours":72},
      {"key":"follow_up","title":"Review next operating week","type":"follow_up","due_hours":192},
      {"key":"verify","title":"Verify improvement against target","type":"verify","due_hours":240},
      {"key":"close_approval","title":"Approve recovery outcome","type":"approval","due_hours":48}
    ]'::jsonb,
    '{"threshold":70,"consecutive_periods":2}'::jsonb
  )
  on conflict (organization_id,playbook_key) do nothing;

  insert into public.workflow_sla_policies(
    organization_id,site,entity_type,priority,acknowledgement_hours,resolution_hours,escalation_hours,enabled
  ) values
    (p_organization_id,null,'manager_task','any',24,72,24,true),
    (p_organization_id,null,'coaching','any',24,168,24,true),
    (p_organization_id,null,'incident','any',12,96,12,true),
    (p_organization_id,null,'approval','any',12,48,12,true),
    (p_organization_id,null,'workflow','any',24,240,24,true)
  on conflict (organization_id,(coalesce(site,'*')),entity_type,priority) do nothing;

  insert into public.workflow_notification_routes(
    organization_id,category,minimum_severity,channel,recipient_role,enabled
  ) values
    (p_organization_id,'sla','high','in_app','manager',true),
    (p_organization_id,'automation','medium','in_app','manager',true)
  on conflict (organization_id,category,channel,recipient_role) do nothing;
end;
$$;

create or replace function public.list_automation_rules(p_organization_id uuid)
returns setof public.automation_rules
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.ensure_default_workflow_config(p_organization_id);
  return query select * from public.automation_rules
  where organization_id=p_organization_id
  order by enabled desc,lower(name);
end;
$$;

create or replace function public.upsert_automation_rule(
  p_organization_id uuid,
  p_rule_id uuid,
  p_name text,
  p_description text,
  p_enabled boolean,
  p_site text,
  p_trigger_type text,
  p_condition_config jsonb,
  p_action_type text,
  p_action_config jsonb,
  p_schedule_mode text,
  p_schedule_day integer,
  p_schedule_hour integer
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_next timestamptz;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_automations')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'Rule name is required'; end if;
  if p_trigger_type not in ('fico_below','total_score_below','concessions_above','dcr_wow_drop','stale_source','overdue_coaching','overdue_incident','scheduled_digest') then
    raise exception 'Invalid trigger type';
  end if;
  if p_action_type not in ('manager_task','notification','coaching','incident','playbook','approval') then
    raise exception 'Invalid action type';
  end if;
  if p_schedule_mode not in ('event','manual','daily','weekly') then raise exception 'Invalid schedule mode'; end if;

  v_next:=private.next_automation_time(p_schedule_mode,p_schedule_day,p_schedule_hour,now());

  if p_rule_id is null then
    insert into public.automation_rules(
      organization_id,name,description,enabled,site,trigger_type,condition_config,
      action_type,action_config,schedule_mode,schedule_day,schedule_hour,next_run_at,created_by,updated_by
    ) values (
      p_organization_id,btrim(p_name),nullif(btrim(coalesce(p_description,'')),''),
      coalesce(p_enabled,false),nullif(upper(btrim(coalesce(p_site,''))),''),
      p_trigger_type,coalesce(p_condition_config,'{}'::jsonb),
      p_action_type,coalesce(p_action_config,'{}'::jsonb),
      p_schedule_mode,p_schedule_day,p_schedule_hour,v_next,(select auth.uid()),(select auth.uid())
    ) returning id into v_id;
  else
    update public.automation_rules
    set name=btrim(p_name),
        description=nullif(btrim(coalesce(p_description,'')),''),
        enabled=coalesce(p_enabled,false),
        site=nullif(upper(btrim(coalesce(p_site,''))),''),
        trigger_type=p_trigger_type,
        condition_config=coalesce(p_condition_config,'{}'::jsonb),
        action_type=p_action_type,
        action_config=coalesce(p_action_config,'{}'::jsonb),
        schedule_mode=p_schedule_mode,
        schedule_day=p_schedule_day,
        schedule_hour=p_schedule_hour,
        next_run_at=case
          when schedule_mode is distinct from p_schedule_mode
            or schedule_day is distinct from p_schedule_day
            or schedule_hour is distinct from p_schedule_hour
          then v_next else next_run_at end,
        updated_by=(select auth.uid()),
        updated_at=now()
    where id=p_rule_id and organization_id=p_organization_id
    returning id into v_id;
    if v_id is null then raise exception 'Rule not found'; end if;
  end if;

  perform public.write_audit_event(
    p_organization_id,'automation_rule_saved','automation_rule',v_id::text,'Automation rule saved',
    null,p_site,null,'{}'::jsonb,
    jsonb_build_object('name',p_name,'trigger_type',p_trigger_type,'action_type',p_action_type,'enabled',p_enabled,'schedule_mode',p_schedule_mode),
    jsonb_build_object('condition_config',p_condition_config,'action_config',p_action_config)
  );
  return v_id;
end;
$$;

create or replace function public.set_automation_rule_enabled(p_rule_id uuid,p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.automation_rules where id=p_rule_id;
  if v_org is null then raise exception 'Rule not found'; end if;
  if not private.has_workspace_permission(v_org,'manage_automations')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  update public.automation_rules
  set enabled=coalesce(p_enabled,false),updated_by=(select auth.uid()),updated_at=now()
  where id=p_rule_id;
end;
$$;

create or replace function public.list_automation_runs(p_organization_id uuid,p_limit integer default 200)
returns table(
  id uuid,rule_id uuid,rule_name text,status text,matched_count integer,action_count integer,
  error_message text,context jsonb,triggered_by uuid,triggered_by_name text,
  started_at timestamptz,finished_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_workflows')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  return query
  select r.id,r.rule_id,a.name,r.status,r.matched_count,r.action_count,r.error_message,r.context,
         r.triggered_by,p.full_name,r.started_at,r.finished_at
  from public.automation_runs r
  left join public.automation_rules a on a.id=r.rule_id
  left join public.profiles p on p.id=r.triggered_by
  where r.organization_id=p_organization_id
  order by r.started_at desc
  limit greatest(1,least(coalesce(p_limit,200),1000));
end;
$$;

create or replace function public.list_workflow_playbooks(p_organization_id uuid)
returns setof public.workflow_playbooks
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.ensure_default_workflow_config(p_organization_id);
  return query select * from public.workflow_playbooks
  where organization_id=p_organization_id
  order by built_in desc,lower(name);
end;
$$;

create or replace function public.start_playbook_workflow(
  p_organization_id uuid,
  p_playbook_key text,
  p_driver_id uuid default null,
  p_site text default null,
  p_week_label text default null,
  p_title text default null,
  p_source_type text default 'manual',
  p_source_id text default null,
  p_dedupe_key text default null,
  p_assigned_to uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_playbook public.workflow_playbooks%rowtype;
  v_id uuid;
  v_step jsonb;
  v_due_hours integer;
  v_site text;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_workflows')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  perform public.ensure_default_workflow_config(p_organization_id);

  select * into v_playbook from public.workflow_playbooks
  where organization_id=p_organization_id and playbook_key=p_playbook_key and enabled=true;
  if not found then raise exception 'Playbook not found'; end if;

  if p_driver_id is not null then
    if not private.is_platform_privileged() and not private.can_access_driver(p_organization_id,p_driver_id) then
      raise exception 'Driver not accessible' using errcode='42501';
    end if;
    select site into v_site from public.drivers where id=p_driver_id and organization_id=p_organization_id;
  end if;
  v_site:=coalesce(nullif(upper(btrim(coalesce(p_site,''))),''),v_site);

  if p_dedupe_key is not null then
    select id into v_id from public.workflow_instances
    where organization_id=p_organization_id and dedupe_key=p_dedupe_key and status not in ('completed','cancelled')
    order by created_at desc limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  v_step:=v_playbook.steps->0;
  v_due_hours:=greatest(1,coalesce((v_step->>'due_hours')::integer,24));

  insert into public.workflow_instances(
    organization_id,playbook_id,driver_id,site,week_label,title,status,current_step,assigned_to,due_at,
    source_type,source_id,dedupe_key,metadata,created_by
  ) values (
    p_organization_id,v_playbook.id,p_driver_id,v_site,nullif(btrim(coalesce(p_week_label,'')),''),
    coalesce(nullif(btrim(coalesce(p_title,'')),''),v_playbook.name),
    'in_progress',0,p_assigned_to,now()+make_interval(hours=>v_due_hours),
    p_source_type,p_source_id,p_dedupe_key,coalesce(p_metadata,'{}'::jsonb),(select auth.uid())
  ) returning id into v_id;

  if v_step is not null then
    insert into public.workflow_step_runs(
      organization_id,workflow_instance_id,step_key,step_order,title,step_type,status,assigned_to,due_at,metadata
    ) values (
      p_organization_id,v_id,coalesce(v_step->>'key','step_1'),0,coalesce(v_step->>'title','Step 1'),
      coalesce(v_step->>'type','action'),'open',p_assigned_to,
      now()+make_interval(hours=>v_due_hours),v_step
    );
  end if;

  perform public.write_audit_event(
    p_organization_id,'workflow_started','workflow_instance',v_id::text,'Workflow playbook started',
    p_driver_id,v_site,p_week_label,'{}'::jsonb,
    jsonb_build_object('playbook_key',p_playbook_key,'title',coalesce(p_title,v_playbook.name),'source_type',p_source_type),
    coalesce(p_metadata,'{}'::jsonb)
  );

  return v_id;
end;
$$;

create or replace function private.advance_workflow_after_step(p_instance_id uuid,p_completed_order integer)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_instance public.workflow_instances%rowtype;
  v_playbook public.workflow_playbooks%rowtype;
  v_next_order integer:=p_completed_order+1;
  v_step jsonb;
  v_step_id uuid;
  v_due_hours integer;
begin
  select * into v_instance from public.workflow_instances where id=p_instance_id;
  if not found then return; end if;
  select * into v_playbook from public.workflow_playbooks where id=v_instance.playbook_id;
  v_step:=v_playbook.steps->v_next_order;

  if v_step is null then
    update public.workflow_instances
    set status='completed',current_step=v_next_order,completed_at=now(),updated_at=now()
    where id=p_instance_id;
    return;
  end if;

  v_due_hours:=greatest(1,coalesce((v_step->>'due_hours')::integer,24));

  insert into public.workflow_step_runs(
    organization_id,workflow_instance_id,step_key,step_order,title,step_type,status,assigned_to,due_at,metadata
  ) values (
    v_instance.organization_id,p_instance_id,coalesce(v_step->>'key','step_'||(v_next_order+1)),v_next_order,
    coalesce(v_step->>'title','Step '||(v_next_order+1)),coalesce(v_step->>'type','action'),
    case when coalesce(v_step->>'type','action')='approval' then 'waiting_approval' else 'open' end,
    v_instance.assigned_to,now()+make_interval(hours=>v_due_hours),v_step
  ) returning id into v_step_id;

  update public.workflow_instances
  set current_step=v_next_order,
      status=case when coalesce(v_step->>'type','action')='approval' then 'waiting_approval' else 'in_progress' end,
      due_at=now()+make_interval(hours=>v_due_hours),
      updated_at=now()
  where id=p_instance_id;

  if coalesce(v_step->>'type','action')='approval' then
    insert into public.approval_requests(
      organization_id,workflow_instance_id,workflow_step_id,driver_id,site,entity_type,entity_id,
      request_type,title,detail,priority,status,dedupe_key,requested_by,metadata
    ) values (
      v_instance.organization_id,p_instance_id,v_step_id,v_instance.driver_id,v_instance.site,
      'workflow',p_instance_id::text,'workflow_step',
      coalesce(v_step->>'title','Workflow approval'),
      'Approval is required before this workflow can continue.',
      'high','pending','workflow:'||p_instance_id::text||':step:'||v_next_order::text,
      (select auth.uid()),v_step
    )
    on conflict (organization_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
end;
$$;

create or replace function public.complete_workflow_step(p_step_id uuid,p_notes text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_step public.workflow_step_runs%rowtype; v_instance public.workflow_instances%rowtype;
begin
  select * into v_step from public.workflow_step_runs where id=p_step_id;
  if not found then raise exception 'Workflow step not found'; end if;
  select * into v_instance from public.workflow_instances where id=v_step.workflow_instance_id;

  if not private.has_workspace_permission(v_step.organization_id,'manage_workflows')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if v_step.step_type='approval' then raise exception 'Approval steps must be decided from Approval Center'; end if;
  if v_step.status in ('completed','skipped','cancelled') then return; end if;

  update public.workflow_step_runs
  set status='completed',completed_at=now(),notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),updated_at=now()
  where id=p_step_id;

  perform private.advance_workflow_after_step(v_step.workflow_instance_id,v_step.step_order);

  perform public.write_audit_event(
    v_step.organization_id,'workflow_step_completed','workflow_step',p_step_id::text,'Workflow step completed',
    v_instance.driver_id,v_instance.site,v_instance.week_label,
    jsonb_build_object('status',v_step.status),
    jsonb_build_object('status','completed','step_key',v_step.step_key),
    jsonb_build_object('notes',p_notes)
  );
end;
$$;

create or replace function public.request_entity_approval(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_request_type text,
  p_title text,
  p_detail text default null,
  p_priority text default 'medium',
  p_driver_id uuid default null,
  p_site text default null,
  p_dedupe_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_workflows')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if p_driver_id is not null and not private.is_platform_privileged()
     and not private.can_access_driver(p_organization_id,p_driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;

  if p_dedupe_key is not null then
    select id into v_id from public.approval_requests
    where organization_id=p_organization_id and dedupe_key=p_dedupe_key and status='pending'
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.approval_requests(
    organization_id,driver_id,site,entity_type,entity_id,request_type,title,detail,priority,status,
    dedupe_key,requested_by,metadata
  ) values (
    p_organization_id,p_driver_id,nullif(upper(btrim(coalesce(p_site,''))),''),
    p_entity_type,p_entity_id,p_request_type,coalesce(nullif(btrim(p_title),''),'Approval request'),
    nullif(btrim(coalesce(p_detail,'')),''),
    case when p_priority in ('low','medium','high','critical') then p_priority else 'medium' end,
    'pending',p_dedupe_key,(select auth.uid()),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;

  perform public.write_audit_event(
    p_organization_id,'approval_requested','approval_request',v_id::text,'Approval requested',
    p_driver_id,p_site,null,'{}'::jsonb,
    jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id,'request_type',p_request_type,'title',p_title),
    coalesce(p_metadata,'{}'::jsonb)
  );
  return v_id;
end;
$$;

create or replace function public.decide_approval_request(
  p_approval_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_req public.approval_requests%rowtype;
begin
  select * into v_req from public.approval_requests where id=p_approval_id;
  if not found then raise exception 'Approval request not found'; end if;

  if not private.has_workspace_permission(v_req.organization_id,'approve_workflows')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  if v_req.status<>'pending' then raise exception 'Approval is no longer pending'; end if;

  update public.approval_requests
  set status=p_decision,reviewed_by=(select auth.uid()),reviewed_at=now(),
      decision_note=nullif(btrim(coalesce(p_note,'')),'')
  where id=p_approval_id;

  if v_req.workflow_step_id is not null then
    if p_decision='approved' then
      update public.workflow_step_runs
      set status='completed',completed_at=now(),notes=coalesce(nullif(btrim(coalesce(p_note,'')),''),notes),updated_at=now()
      where id=v_req.workflow_step_id;
      perform private.advance_workflow_after_step(v_req.workflow_instance_id,
        (select step_order from public.workflow_step_runs where id=v_req.workflow_step_id));
    else
      update public.workflow_step_runs
      set status='open',notes=coalesce(nullif(btrim(coalesce(p_note,'')),''),notes),updated_at=now()
      where id=v_req.workflow_step_id;
      update public.workflow_instances set status='in_progress',updated_at=now()
      where id=v_req.workflow_instance_id;
    end if;
  end if;

  perform public.write_audit_event(
    v_req.organization_id,'approval_decided','approval_request',v_req.id::text,'Approval request '||p_decision,
    v_req.driver_id,v_req.site,null,
    jsonb_build_object('status',v_req.status),
    jsonb_build_object('status',p_decision,'decision_note',p_note),
    jsonb_build_object('entity_type',v_req.entity_type,'entity_id',v_req.entity_id)
  );
end;
$$;

create or replace function public.list_approval_requests(
  p_organization_id uuid,
  p_status text default null,
  p_limit integer default 500
)
returns table(
  id uuid,workflow_instance_id uuid,workflow_step_id uuid,driver_id uuid,driver_name text,trid text,site text,
  entity_type text,entity_id text,request_type text,title text,detail text,priority text,status text,
  requested_by uuid,requested_by_name text,requested_at timestamptz,reviewed_by uuid,reviewed_by_name text,
  reviewed_at timestamptz,decision_note text,metadata jsonb
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_workflows')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select a.id,a.workflow_instance_id,a.workflow_step_id,a.driver_id,d.full_name,d.trid,a.site,
         a.entity_type,a.entity_id,a.request_type,a.title,a.detail,a.priority,a.status,
         a.requested_by,rq.full_name,a.requested_at,a.reviewed_by,rv.full_name,
         a.reviewed_at,a.decision_note,a.metadata
  from public.approval_requests a
  left join public.drivers d on d.id=a.driver_id
  left join public.profiles rq on rq.id=a.requested_by
  left join public.profiles rv on rv.id=a.reviewed_by
  where a.organization_id=p_organization_id
    and (p_status is null or a.status=p_status)
    and (a.driver_id is null or private.is_platform_privileged() or private.can_access_driver(a.organization_id,a.driver_id))
    and (a.site is null or private.is_platform_privileged() or private.can_access_site(a.organization_id,a.site))
  order by case a.priority when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
           a.requested_at desc
  limit greatest(1,least(coalesce(p_limit,500),2000));
end;
$$;

create or replace function public.list_workflow_instances(
  p_organization_id uuid,
  p_status text default null,
  p_limit integer default 500
)
returns table(
  id uuid,playbook_id uuid,playbook_key text,playbook_name text,driver_id uuid,driver_name text,trid text,
  site text,week_label text,title text,status text,current_step integer,assigned_to uuid,assigned_name text,
  due_at timestamptz,completed_at timestamptz,source_type text,source_id text,metadata jsonb,
  created_at timestamptz,updated_at timestamptz,
  current_step_id uuid,current_step_title text,current_step_type text,current_step_status text,current_step_due_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_workflows')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select w.id,w.playbook_id,p.playbook_key,p.name,w.driver_id,d.full_name,d.trid,w.site,w.week_label,w.title,w.status,w.current_step,
         w.assigned_to,pr.full_name,w.due_at,w.completed_at,w.source_type,w.source_id,w.metadata,w.created_at,w.updated_at,
         s.id,s.title,s.step_type,s.status,s.due_at
  from public.workflow_instances w
  join public.workflow_playbooks p on p.id=w.playbook_id
  left join public.drivers d on d.id=w.driver_id
  left join public.profiles pr on pr.id=w.assigned_to
  left join public.workflow_step_runs s on s.workflow_instance_id=w.id and s.step_order=w.current_step
  where w.organization_id=p_organization_id
    and (p_status is null or w.status=p_status)
    and (w.driver_id is null or private.is_platform_privileged() or private.can_access_driver(w.organization_id,w.driver_id))
    and (w.site is null or private.is_platform_privileged() or private.can_access_site(w.organization_id,w.site))
  order by case w.status when 'waiting_approval' then 0 when 'in_progress' then 1 when 'open' then 2 else 3 end,
           w.due_at nulls last,w.updated_at desc
  limit greatest(1,least(coalesce(p_limit,500),2000));
end;
$$;

create or replace function public.list_workflow_sla_policies(p_organization_id uuid)
returns setof public.workflow_sla_policies
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.ensure_default_workflow_config(p_organization_id);
  return query select * from public.workflow_sla_policies
  where organization_id=p_organization_id
  order by coalesce(site,''),entity_type,priority;
end;
$$;

create or replace function public.upsert_workflow_sla_policy(
  p_organization_id uuid,p_site text,p_entity_type text,p_priority text,
  p_acknowledgement_hours integer,p_resolution_hours integer,p_escalation_hours integer,p_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid; v_site text;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_automations')
     and not private.is_platform_privileged() then raise exception 'Not authorised' using errcode='42501'; end if;
  v_site:=nullif(upper(btrim(coalesce(p_site,''))),'');
  insert into public.workflow_sla_policies(
    organization_id,site,entity_type,priority,acknowledgement_hours,resolution_hours,escalation_hours,enabled,updated_by
  ) values (
    p_organization_id,v_site,p_entity_type,p_priority,p_acknowledgement_hours,p_resolution_hours,p_escalation_hours,p_enabled,(select auth.uid())
  )
  on conflict (organization_id,(coalesce(site,'*')),entity_type,priority) do update
  set acknowledgement_hours=excluded.acknowledgement_hours,resolution_hours=excluded.resolution_hours,
      escalation_hours=excluded.escalation_hours,enabled=excluded.enabled,updated_by=(select auth.uid()),updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_notification_routes(p_organization_id uuid)
returns setof public.workflow_notification_routes
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.ensure_default_workflow_config(p_organization_id);
  return query select * from public.workflow_notification_routes
  where organization_id=p_organization_id
  order by category,channel,recipient_role;
end;
$$;

create or replace function public.upsert_notification_route(
  p_organization_id uuid,p_category text,p_minimum_severity text,p_channel text,p_recipient_role text,p_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_automations')
     and not private.is_platform_privileged() then raise exception 'Not authorised' using errcode='42501'; end if;

  insert into public.workflow_notification_routes(
    organization_id,category,minimum_severity,channel,recipient_role,enabled,updated_by
  ) values (
    p_organization_id,lower(btrim(p_category)),p_minimum_severity,p_channel,p_recipient_role,p_enabled,(select auth.uid())
  )
  on conflict (organization_id,category,channel,recipient_role) do update
  set minimum_severity=excluded.minimum_severity,enabled=excluded.enabled,updated_by=(select auth.uid()),updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.ensure_default_workflow_config(uuid) to authenticated;
grant execute on function public.list_automation_rules(uuid) to authenticated;
grant execute on function public.upsert_automation_rule(uuid,uuid,text,text,boolean,text,text,jsonb,text,jsonb,text,integer,integer) to authenticated;
grant execute on function public.set_automation_rule_enabled(uuid,boolean) to authenticated;
grant execute on function public.list_automation_runs(uuid,integer) to authenticated;
grant execute on function public.list_workflow_playbooks(uuid) to authenticated;
grant execute on function public.start_playbook_workflow(uuid,text,uuid,text,text,text,text,text,text,uuid,jsonb) to authenticated;
grant execute on function public.complete_workflow_step(uuid,text) to authenticated;
grant execute on function public.request_entity_approval(uuid,text,text,text,text,text,text,uuid,text,text,jsonb) to authenticated;
grant execute on function public.decide_approval_request(uuid,text,text) to authenticated;
grant execute on function public.list_approval_requests(uuid,text,integer) to authenticated;
grant execute on function public.list_workflow_instances(uuid,text,integer) to authenticated;
grant execute on function public.list_workflow_sla_policies(uuid) to authenticated;
grant execute on function public.upsert_workflow_sla_policy(uuid,text,text,text,integer,integer,integer,boolean) to authenticated;
grant execute on function public.list_notification_routes(uuid) to authenticated;
grant execute on function public.upsert_notification_route(uuid,text,text,text,text,boolean) to authenticated;

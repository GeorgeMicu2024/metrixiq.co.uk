-- MetrixIQ Integration & Delivery Platform V9
-- Public API keys, usage metering, outgoing webhooks, encrypted delivery connections and integration health.

alter table public.imports alter column uploaded_by drop not null;

alter table public.workflow_notification_routes
  drop constraint if exists workflow_notification_routes_channel_check;
alter table public.workflow_notification_routes
  add constraint workflow_notification_routes_channel_check
  check (channel in ('in_app','email_digest','whatsapp_summary','slack','teams','webhook'));

alter table public.workflow_delivery_queue
  drop constraint if exists workflow_delivery_queue_channel_check;
alter table public.workflow_delivery_queue
  add constraint workflow_delivery_queue_channel_check
  check (channel in ('email_digest','whatsapp_summary','slack','teams','webhook'));

alter table public.workflow_delivery_queue
  drop constraint if exists workflow_delivery_queue_status_check;
alter table public.workflow_delivery_queue
  add constraint workflow_delivery_queue_status_check
  check (status in ('queued','prepared','processing','retrying','sent','failed','dead_letter','cancelled'));

alter table public.workflow_delivery_queue
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz null,
  add column if not exists last_error text null,
  add column if not exists response_status integer null;

create table if not exists public.developer_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}'::text[],
  status text not null default 'active' check (status in ('active','revoked')),
  rate_limit_per_hour integer not null default 300 check (rate_limit_per_hour between 10 and 5000),
  expires_at timestamptz null,
  last_used_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  revoked_by uuid null references auth.users(id) on delete set null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists developer_api_keys_org_idx
  on public.developer_api_keys(organization_id,status,created_at desc);

create table if not exists public.developer_api_usage_hourly (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  api_key_id uuid not null references public.developer_api_keys(id) on delete cascade,
  bucket_start timestamptz not null,
  request_count integer not null default 0,
  error_count integer not null default 0,
  bytes_out bigint not null default 0,
  last_request_at timestamptz not null default now(),
  primary key (api_key_id,bucket_start)
);

create index if not exists developer_api_usage_org_idx
  on public.developer_api_usage_hourly(organization_id,bucket_start desc);

create table if not exists public.outbound_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  url text not null,
  secret_ciphertext text not null,
  event_types text[] not null default '{}'::text[],
  enabled boolean not null default true,
  failure_count integer not null default 0,
  last_success_at timestamptz null,
  last_failure_at timestamptz null,
  last_error text null,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name)
);

create table if not exists public.outbound_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  event_key text not null,
  source_type text null,
  source_id text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id,event_type,event_key)
);

create table if not exists public.outbound_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id uuid not null references public.outbound_webhook_endpoints(id) on delete cascade,
  event_id uuid not null references public.outbound_webhook_events(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','retrying','succeeded','dead_letter','cancelled')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  response_status integer null,
  response_body text null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz null,
  unique (endpoint_id,event_id)
);

create index if not exists webhook_deliveries_due_idx
  on public.outbound_webhook_deliveries(status,next_attempt_at);
create index if not exists webhook_events_org_idx
  on public.outbound_webhook_events(organization_id,created_at desc);

create table if not exists public.delivery_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('email_digest','whatsapp_summary','slack','teams','webhook')),
  provider text not null check (provider in ('resend','whatsapp_cloud','slack_webhook','teams_webhook','generic_webhook')),
  config_ciphertext text not null,
  enabled boolean not null default true,
  status text not null default 'configured' check (status in ('configured','healthy','warning','error','disabled')),
  last_tested_at timestamptz null,
  last_success_at timestamptz null,
  last_failure_at timestamptz null,
  last_error text null,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name)
);

create index if not exists delivery_connections_org_idx
  on public.delivery_connections(organization_id,channel,enabled);

alter table public.developer_api_keys enable row level security;
alter table public.developer_api_usage_hourly enable row level security;
alter table public.outbound_webhook_endpoints enable row level security;
alter table public.outbound_webhook_events enable row level security;
alter table public.outbound_webhook_deliveries enable row level security;
alter table public.delivery_connections enable row level security;

revoke all on public.developer_api_keys from authenticated;
revoke all on public.developer_api_usage_hourly from authenticated;
revoke all on public.outbound_webhook_endpoints from authenticated;
revoke all on public.outbound_webhook_events from authenticated;
revoke all on public.outbound_webhook_deliveries from authenticated;
revoke all on public.delivery_connections from authenticated;

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
      'view_portfolio',true,'view_enterprise_settings',true,'view_workflows',true,'view_developer_platform',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_portfolio',true,'manage_kpi_policy',true,'manage_branding',true,
      'manage_automations',true,'manage_workflows',true,'approve_workflows',true,
      'manage_api_keys',true,'manage_webhooks',true,'manage_delivery',true,
      'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'admin' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,'view_integrations',true,'view_reliability',true,
      'view_portfolio',true,'view_enterprise_settings',true,'view_workflows',true,'view_developer_platform',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_portfolio',true,'manage_kpi_policy',true,'manage_branding',true,
      'manage_automations',true,'manage_workflows',true,'approve_workflows',true,
      'manage_api_keys',true,'manage_webhooks',true,'manage_delivery',true,
      'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'manager' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,'view_integrations',true,'view_reliability',true,
      'view_portfolio',true,'view_enterprise_settings',true,'view_workflows',true,'view_developer_platform',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_portfolio',false,'manage_kpi_policy',true,'manage_branding',true,
      'manage_automations',true,'manage_workflows',true,'approve_workflows',true,
      'manage_api_keys',false,'manage_webhooks',true,'manage_delivery',true,
      'manage_team',true,'manage_permissions',false,'view_billing',false
    )
    when 'dispatcher' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'view_site_operations',true,'view_incidents',true,'view_integrations',false,'view_reliability',false,
      'view_portfolio',false,'view_enterprise_settings',false,'view_workflows',true,'view_developer_platform',false,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',false,'run_reliability_checks',false,
      'manage_portfolio',false,'manage_kpi_policy',false,'manage_branding',false,
      'manage_automations',false,'manage_workflows',true,'approve_workflows',false,
      'manage_api_keys',false,'manage_webhooks',false,'manage_delivery',false,
      'manage_team',false,'manage_permissions',false,'view_billing',false
    )
    else jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'view_site_operations',true,'view_incidents',true,'view_integrations',false,'view_reliability',false,
      'view_portfolio',false,'view_enterprise_settings',false,'view_workflows',false,'view_developer_platform',false,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',false,'bulk_actions',false,'manage_incidents',false,'manage_integrations',false,'run_reliability_checks',false,
      'manage_portfolio',false,'manage_kpi_policy',false,'manage_branding',false,
      'manage_automations',false,'manage_workflows',false,'approve_workflows',false,
      'manage_api_keys',false,'manage_webhooks',false,'manage_delivery',false,
      'manage_team',false,'manage_permissions',false,'view_billing',false
    )
  end;
$$;

create or replace function public.list_api_keys(p_organization_id uuid)
returns table(
  id uuid,name text,key_prefix text,scopes text[],status text,rate_limit_per_hour integer,
  expires_at timestamptz,last_used_at timestamptz,created_by uuid,created_by_name text,
  revoked_at timestamptz,created_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_developer_platform')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select k.id,k.name,k.key_prefix,k.scopes,k.status,k.rate_limit_per_hour,k.expires_at,k.last_used_at,
         k.created_by,p.full_name,k.revoked_at,k.created_at
  from public.developer_api_keys k
  left join public.profiles p on p.id=k.created_by
  where k.organization_id=p_organization_id
  order by k.created_at desc;
end;
$$;

create or replace function public.create_api_key_record(
  p_organization_id uuid,
  p_name text,
  p_key_prefix text,
  p_key_hash text,
  p_scopes text[],
  p_rate_limit_per_hour integer,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_api_keys')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'API key name is required'; end if;
  if length(coalesce(p_key_hash,''))<>64 then raise exception 'Invalid API key hash'; end if;
  if coalesce(array_length(p_scopes,1),0)=0 then raise exception 'At least one API scope is required'; end if;
  if not p_scopes <@ array[
    'drivers:read','scorecards:read','workflows:read','reports:read','bi:read','imports:write'
  ]::text[] then raise exception 'Unsupported API scope'; end if;

  insert into public.developer_api_keys(
    organization_id,name,key_prefix,key_hash,scopes,rate_limit_per_hour,expires_at,created_by
  ) values (
    p_organization_id,btrim(p_name),p_key_prefix,p_key_hash,p_scopes,
    greatest(10,least(coalesce(p_rate_limit_per_hour,300),5000)),
    p_expires_at,(select auth.uid())
  ) returning id into v_id;

  perform public.write_audit_event(
    p_organization_id,'api_key_created','developer_api_key',v_id::text,'Developer API key created',
    null,null,null,'{}'::jsonb,
    jsonb_build_object('name',p_name,'key_prefix',p_key_prefix,'scopes',p_scopes,'rate_limit_per_hour',p_rate_limit_per_hour,'expires_at',p_expires_at),
    '{}'::jsonb
  );
  return v_id;
end;
$$;

create or replace function public.revoke_api_key(p_api_key_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.developer_api_keys where id=p_api_key_id;
  if v_org is null then raise exception 'API key not found'; end if;
  if not private.has_workspace_permission(v_org,'manage_api_keys')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  update public.developer_api_keys
  set status='revoked',revoked_by=(select auth.uid()),revoked_at=now()
  where id=p_api_key_id;

  perform public.write_audit_event(
    v_org,'api_key_revoked','developer_api_key',p_api_key_id::text,'Developer API key revoked',
    null,null,null,'{}'::jsonb,jsonb_build_object('status','revoked'),'{}'::jsonb
  );
end;
$$;

create or replace function public.authenticate_api_key(
  p_key_hash text,
  p_required_scope text
)
returns table(
  auth_status text,
  api_key_id uuid,
  organization_id uuid,
  organization_name text,
  plan text,
  scopes text[],
  rate_limit_per_hour integer,
  usage_count integer
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_key public.developer_api_keys%rowtype;
  v_count integer;
  v_bucket timestamptz:=date_trunc('hour',now());
  v_org_name text;
  v_plan text;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select * into v_key from public.developer_api_keys where key_hash=p_key_hash;
  if not found then
    auth_status:='not_found'; return next; return;
  end if;

  api_key_id:=v_key.id;
  organization_id:=v_key.organization_id;
  scopes:=v_key.scopes;
  rate_limit_per_hour:=v_key.rate_limit_per_hour;

  select o.name,o.plan into v_org_name,v_plan from public.organizations o where o.id=v_key.organization_id;
  organization_name:=v_org_name; plan:=v_plan;

  if v_key.status<>'active' then auth_status:='revoked'; return next; return; end if;
  if v_key.expires_at is not null and v_key.expires_at<=now() then auth_status:='expired'; return next; return; end if;
  if p_required_scope is not null
     and not (p_required_scope=any(v_key.scopes) or '*'=any(v_key.scopes)) then
    auth_status:='scope_denied'; return next; return;
  end if;

  insert into public.developer_api_usage_hourly(
    organization_id,api_key_id,bucket_start,request_count,last_request_at
  ) values (
    v_key.organization_id,v_key.id,v_bucket,1,now()
  )
  on conflict (api_key_id,bucket_start) do update
  set request_count=public.developer_api_usage_hourly.request_count+1,
      last_request_at=now()
  returning request_count into v_count;

  usage_count:=v_count;
  update public.developer_api_keys set last_used_at=now() where id=v_key.id;

  if v_count>v_key.rate_limit_per_hour then auth_status:='rate_limited';
  else auth_status:='ok';
  end if;
  return next;
end;
$$;

create or replace function public.record_api_request_result(
  p_api_key_id uuid,
  p_error boolean,
  p_bytes_out bigint default 0
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  update public.developer_api_usage_hourly
  set error_count=error_count+case when p_error then 1 else 0 end,
      bytes_out=bytes_out+greatest(0,coalesce(p_bytes_out,0))
  where api_key_id=p_api_key_id and bucket_start=date_trunc('hour',now());
end;
$$;

create or replace function public.list_api_usage(
  p_organization_id uuid,
  p_hours integer default 168
)
returns table(
  bucket_start timestamptz,
  request_count bigint,
  error_count bigint,
  bytes_out bigint
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_developer_platform')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select u.bucket_start,sum(u.request_count),sum(u.error_count),sum(u.bytes_out)
  from public.developer_api_usage_hourly u
  where u.organization_id=p_organization_id
    and u.bucket_start>=date_trunc('hour',now())-make_interval(hours=>greatest(1,least(coalesce(p_hours,168),2160)))
  group by u.bucket_start
  order by u.bucket_start;
end;
$$;

create or replace function public.list_webhook_endpoints(p_organization_id uuid)
returns table(
  id uuid,name text,url text,event_types text[],enabled boolean,secret_configured boolean,
  failure_count integer,last_success_at timestamptz,last_failure_at timestamptz,last_error text,
  created_at timestamptz,updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_developer_platform')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select w.id,w.name,w.url,w.event_types,w.enabled,(w.secret_ciphertext is not null),
         w.failure_count,w.last_success_at,w.last_failure_at,w.last_error,w.created_at,w.updated_at
  from public.outbound_webhook_endpoints w
  where w.organization_id=p_organization_id
  order by w.enabled desc,lower(w.name);
end;
$$;

create or replace function public.upsert_webhook_endpoint_record(
  p_organization_id uuid,
  p_endpoint_id uuid,
  p_name text,
  p_url text,
  p_secret_ciphertext text,
  p_event_types text[],
  p_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_webhooks')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'Webhook name is required'; end if;
  if p_url !~ '^https://[^[:space:]]+$' then raise exception 'Webhook URL must use HTTPS'; end if;
  if coalesce(array_length(p_event_types,1),0)=0 then raise exception 'Select at least one webhook event'; end if;
  if not p_event_types <@ array[
    '*','webhook.test','scorecard.updated','workflow.created','workflow.completed','coaching.closed',
    'incident.created','incident.closed','sla.breached','import.completed'
  ]::text[] then raise exception 'Unsupported webhook event type'; end if;

  if p_endpoint_id is null then
    if nullif(p_secret_ciphertext,'') is null then raise exception 'Webhook signing secret is required'; end if;
    insert into public.outbound_webhook_endpoints(
      organization_id,name,url,secret_ciphertext,event_types,enabled,created_by,updated_by
    ) values (
      p_organization_id,btrim(p_name),p_url,p_secret_ciphertext,p_event_types,coalesce(p_enabled,true),
      (select auth.uid()),(select auth.uid())
    ) returning id into v_id;
  else
    update public.outbound_webhook_endpoints
    set name=btrim(p_name),url=p_url,
        secret_ciphertext=coalesce(nullif(p_secret_ciphertext,''),secret_ciphertext),
        event_types=p_event_types,enabled=coalesce(p_enabled,true),
        updated_by=(select auth.uid()),updated_at=now()
    where id=p_endpoint_id and organization_id=p_organization_id
    returning id into v_id;
    if v_id is null then raise exception 'Webhook endpoint not found'; end if;
  end if;

  perform public.write_audit_event(
    p_organization_id,'webhook_endpoint_saved','webhook_endpoint',v_id::text,'Outgoing webhook endpoint saved',
    null,null,null,'{}'::jsonb,
    jsonb_build_object('name',p_name,'url',p_url,'event_types',p_event_types,'enabled',p_enabled),
    '{}'::jsonb
  );
  return v_id;
end;
$$;

create or replace function public.delete_webhook_endpoint(p_endpoint_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.outbound_webhook_endpoints where id=p_endpoint_id;
  if v_org is null then raise exception 'Webhook endpoint not found'; end if;
  if not private.has_workspace_permission(v_org,'manage_webhooks')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  delete from public.outbound_webhook_endpoints where id=p_endpoint_id;
  perform public.write_audit_event(
    v_org,'webhook_endpoint_deleted','webhook_endpoint',p_endpoint_id::text,'Outgoing webhook endpoint deleted',
    null,null,null,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb
  );
end;
$$;

create or replace function private.enqueue_webhook_event(
  p_organization_id uuid,
  p_event_type text,
  p_event_key text,
  p_source_type text,
  p_source_id text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_event_id uuid;
begin
  insert into public.outbound_webhook_events(
    organization_id,event_type,event_key,source_type,source_id,payload
  ) values (
    p_organization_id,p_event_type,p_event_key,p_source_type,p_source_id,coalesce(p_payload,'{}'::jsonb)
  )
  on conflict (organization_id,event_type,event_key) do update
  set payload=excluded.payload
  returning id into v_event_id;

  insert into public.outbound_webhook_deliveries(
    organization_id,endpoint_id,event_id,status,next_attempt_at
  )
  select p_organization_id,e.id,v_event_id,'pending',now()
  from public.outbound_webhook_endpoints e
  where e.organization_id=p_organization_id and e.enabled=true
    and (p_event_type=any(e.event_types) or '*'=any(e.event_types))
  on conflict (endpoint_id,event_id) do nothing;

  return v_event_id;
end;
$$;

create or replace function public.emit_webhook_event(
  p_organization_id uuid,
  p_event_type text,
  p_event_key text,
  p_source_type text,
  p_source_id text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce((select auth.role()),'')<>'service_role'
     and not private.has_workspace_permission(p_organization_id,'manage_webhooks')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  return private.enqueue_webhook_event(p_organization_id,p_event_type,p_event_key,p_source_type,p_source_id,p_payload);
end;
$$;

create or replace function private.webhook_source_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v_event_type text; v_event_key text; v_payload jsonb; v_org uuid; v_id text;
begin
  if tg_table_name='site_scorecards' then
    v_org:=new.organization_id; v_id:=new.id::text;
    v_event_type:='scorecard.updated';
    v_event_key:=new.id::text||':'||extract(epoch from new.updated_at)::bigint::text;
    v_payload:=jsonb_build_object('id',new.id,'site',new.site,'week_label',new.week_label,'overall_score',new.overall_score,'standing',new.standing);

  elsif tg_table_name='workflow_instances' then
    v_org:=new.organization_id; v_id:=new.id::text;
    if tg_op='INSERT' then v_event_type:='workflow.created';
    elsif new.status='completed' and old.status is distinct from new.status then v_event_type:='workflow.completed';
    else return new;
    end if;
    v_event_key:=new.id::text||':'||v_event_type;
    v_payload:=jsonb_build_object('id',new.id,'driver_id',new.driver_id,'site',new.site,'week_label',new.week_label,'title',new.title,'status',new.status);

  elsif tg_table_name='coaching_cases' then
    if not (new.status='closed' and old.status is distinct from new.status) then return new; end if;
    v_org:=new.organization_id; v_id:=new.id::text; v_event_type:='coaching.closed';
    v_event_key:=new.id::text||':closed';
    v_payload:=jsonb_build_object('id',new.id,'driver_id',new.driver_id,'title',new.title,'metric',new.metric,'outcome',new.outcome);

  elsif tg_table_name='operational_incidents' then
    v_org:=new.organization_id; v_id:=new.id::text;
    if tg_op='INSERT' then v_event_type:='incident.created';
    elsif new.status='closed' and old.status is distinct from new.status then v_event_type:='incident.closed';
    else return new;
    end if;
    v_event_key:=new.id::text||':'||v_event_type;
    v_payload:=jsonb_build_object('id',new.id,'driver_id',new.driver_id,'site',new.site,'week_label',new.week_label,'title',new.title,'severity',new.severity,'status',new.status);

  elsif tg_table_name='notification_events' then
    if new.category<>'sla' then return new; end if;
    v_org:=new.organization_id; v_id:=new.id::text; v_event_type:='sla.breached';
    v_event_key:=new.id::text;
    v_payload:=jsonb_build_object('id',new.id,'driver_id',new.driver_id,'site',new.site,'severity',new.severity,'title',new.title,'message',new.message);
  else
    return new;
  end if;

  perform private.enqueue_webhook_event(v_org,v_event_type,v_event_key,tg_table_name,v_id,v_payload);
  return new;
end;
$$;

drop trigger if exists trg_v9_site_scorecard_webhook on public.site_scorecards;
create trigger trg_v9_site_scorecard_webhook
after insert or update on public.site_scorecards
for each row execute function private.webhook_source_trigger();

drop trigger if exists trg_v9_workflow_webhook on public.workflow_instances;
create trigger trg_v9_workflow_webhook
after insert or update of status on public.workflow_instances
for each row execute function private.webhook_source_trigger();

drop trigger if exists trg_v9_coaching_webhook on public.coaching_cases;
create trigger trg_v9_coaching_webhook
after update of status on public.coaching_cases
for each row execute function private.webhook_source_trigger();

drop trigger if exists trg_v9_incident_webhook on public.operational_incidents;
create trigger trg_v9_incident_webhook
after insert or update of status on public.operational_incidents
for each row execute function private.webhook_source_trigger();

drop trigger if exists trg_v9_sla_webhook on public.notification_events;
create trigger trg_v9_sla_webhook
after insert on public.notification_events
for each row execute function private.webhook_source_trigger();

create or replace function public.claim_webhook_deliveries(p_limit integer default 50)
returns table(
  delivery_id uuid,endpoint_id uuid,organization_id uuid,event_id uuid,event_type text,event_key text,
  url text,secret_ciphertext text,payload jsonb,attempt_count integer
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  return query
  with claimed as (
    select d.id
    from public.outbound_webhook_deliveries d
    join public.outbound_webhook_endpoints e on e.id=d.endpoint_id
    where d.status in ('pending','retrying')
      and d.next_attempt_at<=now()
      and e.enabled=true
    order by d.next_attempt_at,d.created_at
    for update of d skip locked
    limit greatest(1,least(coalesce(p_limit,50),200))
  ),
  updated as (
    update public.outbound_webhook_deliveries d
    set status='processing',attempt_count=d.attempt_count+1,updated_at=now()
    from claimed c
    where d.id=c.id
    returning d.*
  )
  select u.id,e.id,u.organization_id,ev.id,ev.event_type,ev.event_key,e.url,e.secret_ciphertext,ev.payload,u.attempt_count
  from updated u
  join public.outbound_webhook_endpoints e on e.id=u.endpoint_id
  join public.outbound_webhook_events ev on ev.id=u.event_id;
end;
$$;

create or replace function public.complete_webhook_delivery(
  p_delivery_id uuid,
  p_success boolean,
  p_response_status integer,
  p_response_body text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_delivery public.outbound_webhook_deliveries%rowtype; v_delay integer;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select * into v_delivery from public.outbound_webhook_deliveries where id=p_delivery_id;
  if not found then return; end if;

  if p_success then
    update public.outbound_webhook_deliveries
    set status='succeeded',response_status=p_response_status,response_body=left(p_response_body,4000),
        last_error=null,delivered_at=now(),updated_at=now()
    where id=p_delivery_id;
    update public.outbound_webhook_endpoints
    set failure_count=0,last_success_at=now(),last_error=null,updated_at=now()
    where id=v_delivery.endpoint_id;
  else
    v_delay:=least(360,power(2,greatest(1,v_delivery.attempt_count))::integer);
    update public.outbound_webhook_deliveries
    set status=case when attempt_count>=6 then 'dead_letter' else 'retrying' end,
        next_attempt_at=case when attempt_count>=6 then next_attempt_at else now()+make_interval(mins=>v_delay) end,
        response_status=p_response_status,response_body=left(p_response_body,4000),last_error=left(p_error,2000),updated_at=now()
    where id=p_delivery_id;
    update public.outbound_webhook_endpoints
    set failure_count=failure_count+1,last_failure_at=now(),last_error=left(p_error,2000),updated_at=now()
    where id=v_delivery.endpoint_id;
  end if;
end;
$$;

create or replace function public.list_webhook_deliveries(p_organization_id uuid,p_limit integer default 250)
returns table(
  id uuid,endpoint_id uuid,endpoint_name text,event_type text,event_key text,status text,attempt_count integer,
  next_attempt_at timestamptz,response_status integer,last_error text,created_at timestamptz,delivered_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_developer_platform')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  return query
  select d.id,e.id,e.name,ev.event_type,ev.event_key,d.status,d.attempt_count,d.next_attempt_at,d.response_status,d.last_error,d.created_at,d.delivered_at
  from public.outbound_webhook_deliveries d
  join public.outbound_webhook_endpoints e on e.id=d.endpoint_id
  join public.outbound_webhook_events ev on ev.id=d.event_id
  where d.organization_id=p_organization_id
  order by d.created_at desc
  limit greatest(1,least(coalesce(p_limit,250),2000));
end;
$$;

create or replace function public.list_delivery_connections(p_organization_id uuid)
returns table(
  id uuid,name text,channel text,provider text,enabled boolean,status text,configured boolean,
  last_tested_at timestamptz,last_success_at timestamptz,last_failure_at timestamptz,last_error text,
  created_at timestamptz,updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_developer_platform')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  return query
  select c.id,c.name,c.channel,c.provider,c.enabled,c.status,(c.config_ciphertext is not null),
         c.last_tested_at,c.last_success_at,c.last_failure_at,c.last_error,c.created_at,c.updated_at
  from public.delivery_connections c
  where c.organization_id=p_organization_id
  order by c.enabled desc,c.channel,lower(c.name);
end;
$$;

create or replace function public.upsert_delivery_connection_record(
  p_organization_id uuid,
  p_connection_id uuid,
  p_name text,
  p_channel text,
  p_provider text,
  p_config_ciphertext text,
  p_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_delivery')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'Connection name is required'; end if;
  if p_channel not in ('email_digest','whatsapp_summary','slack','teams','webhook') then raise exception 'Unsupported channel'; end if;
  if p_provider not in ('resend','whatsapp_cloud','slack_webhook','teams_webhook','generic_webhook') then raise exception 'Unsupported provider'; end if;

  if p_connection_id is null then
    if nullif(p_config_ciphertext,'') is null then raise exception 'Connection configuration is required'; end if;
    insert into public.delivery_connections(
      organization_id,name,channel,provider,config_ciphertext,enabled,status,created_by,updated_by
    ) values (
      p_organization_id,btrim(p_name),p_channel,p_provider,p_config_ciphertext,coalesce(p_enabled,true),
      case when coalesce(p_enabled,true) then 'configured' else 'disabled' end,
      (select auth.uid()),(select auth.uid())
    ) returning id into v_id;
  else
    update public.delivery_connections
    set name=btrim(p_name),channel=p_channel,provider=p_provider,
        config_ciphertext=coalesce(nullif(p_config_ciphertext,''),config_ciphertext),
        enabled=coalesce(p_enabled,true),
        status=case when coalesce(p_enabled,true) then 'configured' else 'disabled' end,
        updated_by=(select auth.uid()),updated_at=now()
    where id=p_connection_id and organization_id=p_organization_id
    returning id into v_id;
    if v_id is null then raise exception 'Connection not found'; end if;
  end if;

  perform public.write_audit_event(
    p_organization_id,'delivery_connection_saved','delivery_connection',v_id::text,'External delivery connection saved',
    null,null,null,'{}'::jsonb,
    jsonb_build_object('name',p_name,'channel',p_channel,'provider',p_provider,'enabled',p_enabled),
    '{}'::jsonb
  );
  return v_id;
end;
$$;

create or replace function public.delete_delivery_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.delivery_connections where id=p_connection_id;
  if v_org is null then raise exception 'Connection not found'; end if;
  if not private.has_workspace_permission(v_org,'manage_delivery')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  delete from public.delivery_connections where id=p_connection_id;
  perform public.write_audit_event(
    v_org,'delivery_connection_deleted','delivery_connection',p_connection_id::text,'External delivery connection deleted',
    null,null,null,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb
  );
end;
$$;

create or replace function public.authorize_integration_action(
  p_organization_id uuid,
  p_permission text
)
returns boolean
language sql
security definer
set search_path to ''
as $$
  select private.is_platform_privileged()
    or private.has_workspace_permission(p_organization_id,p_permission);
$$;

create or replace function public.claim_delivery_messages(p_limit integer default 50)
returns table(
  queue_id uuid,organization_id uuid,channel text,category text,severity text,title text,message text,
  driver_id uuid,site text,payload jsonb,attempt_count integer,
  connection_id uuid,provider text,config_ciphertext text
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  return query
  with candidates as (
    select q.id,
           (
             select c.id
             from public.delivery_connections c
             where c.organization_id=q.organization_id
               and c.channel=q.channel and c.enabled=true
             order by case c.status when 'healthy' then 0 when 'configured' then 1 when 'warning' then 2 else 3 end,c.updated_at desc
             limit 1
           ) as connection_id
    from public.workflow_delivery_queue q
    where q.status in ('queued','prepared','retrying')
      and coalesce(q.next_attempt_at,q.created_at)<=now()
    order by q.created_at
    limit greatest(1,least(coalesce(p_limit,50),200))
    for update of q skip locked
  ),
  claimed as (
    update public.workflow_delivery_queue q
    set status='processing',attempt_count=q.attempt_count+1
    from candidates c
    where q.id=c.id and c.connection_id is not null
    returning q.*,c.connection_id
  )
  select q.id,q.organization_id,q.channel,q.category,q.severity,q.title,q.message,q.driver_id,q.site,q.payload,q.attempt_count,
         c.id,c.provider,c.config_ciphertext
  from claimed q
  join public.delivery_connections c on c.id=q.connection_id;
end;
$$;

create or replace function public.complete_delivery_message(
  p_queue_id uuid,
  p_connection_id uuid,
  p_success boolean,
  p_response_status integer,
  p_error text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_q public.workflow_delivery_queue%rowtype; v_delay integer;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select * into v_q from public.workflow_delivery_queue where id=p_queue_id;
  if not found then return; end if;

  if p_success then
    update public.workflow_delivery_queue
    set status='sent',processed_at=now(),last_error=null,response_status=p_response_status
    where id=p_queue_id;
    update public.delivery_connections
    set status='healthy',last_tested_at=now(),last_success_at=now(),last_error=null,updated_at=now()
    where id=p_connection_id;
  else
    v_delay:=least(360,power(2,greatest(1,v_q.attempt_count))::integer);
    update public.workflow_delivery_queue
    set status=case when attempt_count>=6 then 'dead_letter' else 'retrying' end,
        next_attempt_at=case when attempt_count>=6 then next_attempt_at else now()+make_interval(mins=>v_delay) end,
        processed_at=case when attempt_count>=6 then now() else processed_at end,
        last_error=left(p_error,2000),response_status=p_response_status
    where id=p_queue_id;
    update public.delivery_connections
    set status=case when v_q.attempt_count>=3 then 'error' else 'warning' end,
        last_tested_at=now(),last_failure_at=now(),last_error=left(p_error,2000),updated_at=now()
    where id=p_connection_id;
  end if;
end;
$$;

create or replace function public.mark_delivery_connection_test(
  p_connection_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  update public.delivery_connections
  set status=case when p_success then 'healthy' else 'error' end,
      last_tested_at=now(),
      last_success_at=case when p_success then now() else last_success_at end,
      last_failure_at=case when p_success then last_failure_at else now() end,
      last_error=case when p_success then null else left(p_error,2000) end,
      updated_at=now()
  where id=p_connection_id;
end;
$$;

create or replace function private.queue_routed_delivery(
  p_organization_id uuid,
  p_category text,
  p_severity text,
  p_title text,
  p_message text,
  p_driver_id uuid,
  p_site text,
  p_dedupe_key text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_route public.workflow_notification_routes%rowtype;
begin
  for v_route in
    select *
    from public.workflow_notification_routes r
    where r.organization_id=p_organization_id
      and r.enabled=true
      and r.channel in ('email_digest','whatsapp_summary','slack','teams','webhook')
      and (r.category=lower(p_category) or r.category='*')
      and private.automation_severity_rank(p_severity)>=private.automation_severity_rank(r.minimum_severity)
  loop
    insert into public.workflow_delivery_queue(
      organization_id,route_id,channel,category,severity,title,message,driver_id,site,status,dedupe_key,payload
    ) values (
      p_organization_id,v_route.id,v_route.channel,lower(p_category),p_severity,p_title,p_message,
      p_driver_id,p_site,'queued',p_dedupe_key,coalesce(p_payload,'{}'::jsonb)
    )
    on conflict (organization_id,dedupe_key,channel) do nothing;
  end loop;
end;
$$;

create or replace function public.get_integration_delivery_health(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_active_keys integer;
  v_api_requests bigint;
  v_webhooks integer;
  v_webhook_dead integer;
  v_webhook_pending integer;
  v_connections integer;
  v_delivery_dead integer;
  v_delivery_pending integer;
  v_last_api timestamptz;
  v_last_webhook timestamptz;
  v_last_delivery timestamptz;
begin
  if not private.has_workspace_permission(p_organization_id,'view_developer_platform')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  select count(*),max(last_used_at) into v_active_keys,v_last_api
  from public.developer_api_keys
  where organization_id=p_organization_id and status='active'
    and (expires_at is null or expires_at>now());

  select coalesce(sum(request_count),0) into v_api_requests
  from public.developer_api_usage_hourly
  where organization_id=p_organization_id and bucket_start>=date_trunc('hour',now())-interval '24 hours';

  select count(*) into v_webhooks from public.outbound_webhook_endpoints
  where organization_id=p_organization_id and enabled=true;

  select
    count(*) filter(where status='dead_letter'),
    count(*) filter(where status in ('pending','retrying','processing')),
    max(delivered_at)
  into v_webhook_dead,v_webhook_pending,v_last_webhook
  from public.outbound_webhook_deliveries where organization_id=p_organization_id;

  select count(*) into v_connections from public.delivery_connections
  where organization_id=p_organization_id and enabled=true;

  select
    count(*) filter(where status='dead_letter'),
    count(*) filter(where status in ('queued','prepared','retrying','processing')),
    max(processed_at) filter(where status='sent')
  into v_delivery_dead,v_delivery_pending,v_last_delivery
  from public.workflow_delivery_queue where organization_id=p_organization_id;

  return jsonb_build_object(
    'active_api_keys',v_active_keys,
    'api_requests_24h',v_api_requests,
    'last_api_request_at',v_last_api,
    'active_webhooks',v_webhooks,
    'webhook_pending',v_webhook_pending,
    'webhook_dead_letter',v_webhook_dead,
    'last_webhook_success_at',v_last_webhook,
    'active_delivery_connections',v_connections,
    'delivery_pending',v_delivery_pending,
    'delivery_dead_letter',v_delivery_dead,
    'last_delivery_success_at',v_last_delivery
  );
end;
$$;

grant execute on function public.list_api_keys(uuid) to authenticated;
grant execute on function public.create_api_key_record(uuid,text,text,text,text[],integer,timestamptz) to authenticated;
grant execute on function public.revoke_api_key(uuid) to authenticated;
grant execute on function public.list_api_usage(uuid,integer) to authenticated;
grant execute on function public.list_webhook_endpoints(uuid) to authenticated;
grant execute on function public.upsert_webhook_endpoint_record(uuid,uuid,text,text,text,text[],boolean) to authenticated;
grant execute on function public.delete_webhook_endpoint(uuid) to authenticated;
grant execute on function public.emit_webhook_event(uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.list_webhook_deliveries(uuid,integer) to authenticated;
grant execute on function public.list_delivery_connections(uuid) to authenticated;
grant execute on function public.upsert_delivery_connection_record(uuid,uuid,text,text,text,text,boolean) to authenticated;
grant execute on function public.delete_delivery_connection(uuid) to authenticated;
grant execute on function public.authorize_integration_action(uuid,text) to authenticated;
grant execute on function public.get_integration_delivery_health(uuid) to authenticated;

revoke all on function public.authenticate_api_key(text,text) from public;
revoke all on function public.authenticate_api_key(text,text) from authenticated;
grant execute on function public.authenticate_api_key(text,text) to service_role;

revoke all on function public.record_api_request_result(uuid,boolean,bigint) from public;
revoke all on function public.record_api_request_result(uuid,boolean,bigint) from authenticated;
grant execute on function public.record_api_request_result(uuid,boolean,bigint) to service_role;

revoke all on function public.claim_webhook_deliveries(integer) from public;
revoke all on function public.claim_webhook_deliveries(integer) from authenticated;
grant execute on function public.claim_webhook_deliveries(integer) to service_role;

revoke all on function public.complete_webhook_delivery(uuid,boolean,integer,text,text) from public;
revoke all on function public.complete_webhook_delivery(uuid,boolean,integer,text,text) from authenticated;
grant execute on function public.complete_webhook_delivery(uuid,boolean,integer,text,text) to service_role;

revoke all on function public.claim_delivery_messages(integer) from public;
revoke all on function public.claim_delivery_messages(integer) from authenticated;
grant execute on function public.claim_delivery_messages(integer) to service_role;

revoke all on function public.complete_delivery_message(uuid,uuid,boolean,integer,text) from public;
revoke all on function public.complete_delivery_message(uuid,uuid,boolean,integer,text) from authenticated;
grant execute on function public.complete_delivery_message(uuid,uuid,boolean,integer,text) to service_role;

revoke all on function public.mark_delivery_connection_test(uuid,boolean,text) from public;
revoke all on function public.mark_delivery_connection_test(uuid,boolean,text) from authenticated;
grant execute on function public.mark_delivery_connection_test(uuid,boolean,text) to service_role;

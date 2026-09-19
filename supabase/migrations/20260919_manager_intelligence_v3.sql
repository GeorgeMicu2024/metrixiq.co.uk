-- MetrixIQ Manager Intelligence V3
-- Manager Control Center V2, Notifications V2, Coaching V3 and safe Import Center rollback.

create table if not exists public.manager_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid null references public.drivers(id) on delete cascade,
  site text null,
  source_type text not null default 'manual',
  source_id text null,
  dedupe_key text not null,
  title text not null,
  detail text null,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','done','dismissed')),
  assigned_to uuid null references auth.users(id) on delete set null,
  due_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique (organization_id, dedupe_key)
);

create index if not exists manager_tasks_org_status_idx
  on public.manager_tasks(organization_id,status,priority,updated_at desc);
create index if not exists manager_tasks_driver_idx
  on public.manager_tasks(driver_id,updated_at desc);

alter table public.manager_tasks enable row level security;
revoke insert, update, delete on public.manager_tasks from authenticated;
grant select on public.manager_tasks to authenticated;

drop policy if exists manager_tasks_select on public.manager_tasks;
create policy manager_tasks_select on public.manager_tasks
for select to authenticated
using (
  (
    public.is_workspace_member(organization_id)
    or private.is_platform_privileged()
  )
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

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid null references public.drivers(id) on delete cascade,
  site text null,
  category text not null,
  severity text not null default 'medium' check (severity in ('info','low','medium','high','critical')),
  title text not null,
  message text null,
  status text not null default 'unread' check (status in ('unread','read','reviewed','dismissed')),
  source_type text null,
  source_id text null,
  dedupe_key text not null,
  action_target text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz null,
  reviewed_at timestamptz null,
  unique (organization_id,dedupe_key)
);

create index if not exists notification_events_org_status_idx
  on public.notification_events(organization_id,status,severity,created_at desc);
create index if not exists notification_events_driver_idx
  on public.notification_events(driver_id,created_at desc);

alter table public.notification_events enable row level security;
revoke insert, update, delete on public.notification_events from authenticated;
grant select on public.notification_events to authenticated;

drop policy if exists notification_events_select on public.notification_events;
create policy notification_events_select on public.notification_events
for select to authenticated
using (
  (
    public.is_workspace_member(organization_id)
    or private.is_platform_privileged()
  )
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

create or replace function private.driver_point_score(
  p_mentor numeric,
  p_dcr numeric,
  p_dsc numeric,
  p_lor numeric,
  p_pod numeric,
  p_cc numeric,
  p_ce numeric,
  p_cdf numeric,
  p_psb numeric,
  p_raw jsonb
)
returns numeric
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_score numeric := 0;
  v_dcr numeric;
  v_pod numeric;
  v_cc numeric;
  v_scorecard_source boolean := false;
begin
  select exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_raw->'source_files','[]'::jsonb)) as f(value)
    where lower(f.value) like '%scorecard%'
  ) into v_scorecard_source;

  if p_mentor is not null then
    v_score := v_score + case
      when p_mentor >= 849 then 17
      when p_mentor >= 825 then 15
      when p_mentor >= 810 then 10
      when p_mentor >= 800 then 8
      when p_mentor >= 780 then 5
      else 0 end;
  end if;

  if p_dcr is not null then
    v_dcr := case when p_dcr > 1 then p_dcr/100 else p_dcr end;
    v_score := v_score + case
      when v_dcr >= .999 then 17
      when v_dcr >= .992 then 15
      when v_dcr >= .9885 then 10
      when v_dcr >= .986 then 5
      else 0 end;
  end if;

  if p_dsc is not null then
    v_score := v_score + case
      when p_dsc < .01 then 17
      when p_dsc <= 550 then 15
      when p_dsc <= 650 then 10
      when p_dsc <= 965 then 5
      else 0 end;
  end if;

  if p_lor is not null and p_lor = 0 then v_score := v_score + 6; end if;

  if p_pod is not null then
    v_pod := case when p_pod > 1 then p_pod/100 else p_pod end;
    v_score := v_score + case
      when v_pod >= .9999 then 8
      when v_pod >= .99 then 7
      when v_pod >= .985 then 5
      when v_pod >= .97 then 3
      else 0 end;
  end if;

  if p_cc is not null then
    v_cc := case when p_cc > 1 then p_cc/100 else p_cc end;
    v_score := v_score + case
      when v_cc >= .999 then 8
      when v_cc >= .99 then 7
      when v_cc >= .96 then 5
      when v_cc >= .95 then 1
      else 0 end;
  end if;

  if p_ce is not null and p_ce <= 0 then v_score := v_score + 10; end if;

  if p_cdf is null then
    if v_scorecard_source then v_score := v_score + 10; end if;
  else
    v_score := v_score + case
      when p_cdf <= 4420 then 10
      when p_cdf <= 5420 then 5
      when p_cdf <= 6420 then 3
      else 0 end;
  end if;

  if p_psb is null then
    if v_scorecard_source then v_score := v_score + 7; end if;
  elsif p_psb = 0 then
    v_score := v_score + 7;
  end if;

  return v_score;
end;
$$;

create or replace function private.score_tier_rank(p_score numeric)
returns integer
language sql
immutable
set search_path to ''
as $$
  select case
    when p_score is null then 5
    when p_score < 50 then 4
    when p_score < 70 then 3
    when p_score < 85 then 2
    when p_score < 93 then 1
    else 0
  end;
$$;

create or replace function public.refresh_manager_tasks(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare v_count integer := 0;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_coaching')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  insert into public.manager_tasks(
    organization_id,driver_id,site,source_type,source_id,dedupe_key,title,detail,
    priority,status,due_at,metadata,created_by,updated_at
  )
  select
    a.organization_id,a.driver_id,a.site,'performance_alert',a.id::text,'alert:'||a.id::text,
    a.title,a.message,
    case when a.severity in ('critical','high','medium','low') then a.severity else 'medium' end,
    'open',now()+interval '3 days',
    jsonb_build_object('metric',a.metric,'period_label',a.period_label,'alert_type',a.alert_type),
    (select auth.uid()),now()
  from public.performance_alerts a
  where a.organization_id=p_organization_id and a.status<>'resolved'
    and (private.is_platform_privileged() or a.driver_id is null or private.can_access_driver(a.organization_id,a.driver_id))
  on conflict (organization_id,dedupe_key) do update
    set title=excluded.title,detail=excluded.detail,priority=excluded.priority,site=excluded.site,
        metadata=excluded.metadata,updated_at=now();
  get diagnostics v_count = row_count;

  insert into public.manager_tasks(
    organization_id,driver_id,site,source_type,source_id,dedupe_key,title,detail,
    priority,status,due_at,metadata,created_by,updated_at
  )
  select
    c.organization_id,c.driver_id,d.site,'coaching_case',c.id::text,'coaching:'||c.id::text,
    case when c.due_at < now() then 'Coaching follow-up overdue' else 'Coaching follow-up due soon' end,
    c.title,
    case when c.due_at < now() then 'high' else coalesce(c.priority,'medium') end,
    'open',c.due_at,
    jsonb_build_object('case_status',c.status,'metric',c.metric,'assigned_to',c.assigned_to),
    (select auth.uid()),now()
  from public.coaching_cases c
  join public.drivers d on d.id=c.driver_id
  where c.organization_id=p_organization_id
    and c.status<>'closed'
    and c.due_at is not null
    and c.due_at <= now()+interval '3 days'
    and (private.is_platform_privileged() or private.can_access_driver(c.organization_id,c.driver_id))
  on conflict (organization_id,dedupe_key) do update
    set title=excluded.title,detail=excluded.detail,priority=excluded.priority,due_at=excluded.due_at,
        metadata=excluded.metadata,updated_at=now();

  insert into public.manager_tasks(
    organization_id,site,source_type,source_id,dedupe_key,title,detail,priority,status,metadata,created_by,updated_at
  )
  select
    u.organization_id,u.site,'data_quality',coalesce(u.site,'workspace'),
    'unmatched:'||coalesce(u.site,'workspace'),
    'Resolve unmatched driver evidence',
    count(*)::text||' imported record'||case when count(*)=1 then '' else 's' end||' need identity resolution.',
    case when count(*)>=20 then 'high' else 'medium' end,
    'open',
    jsonb_build_object('unmatched_count',count(*)),
    (select auth.uid()),now()
  from public.unmatched_driver_records u
  where u.organization_id=p_organization_id and u.status='open'
    and (private.is_platform_privileged() or u.site is null or private.can_access_site(u.organization_id,u.site))
  group by u.organization_id,u.site
  on conflict (organization_id,dedupe_key) do update
    set detail=excluded.detail,priority=excluded.priority,metadata=excluded.metadata,updated_at=now();

  insert into public.manager_tasks(
    organization_id,source_type,source_id,dedupe_key,title,detail,priority,status,metadata,created_by,updated_at
  )
  select
    i.organization_id,'import',i.id::text,'import:'||i.id::text,
    'Import failed: '||i.file_name,
    coalesce(i.error_message,'Review the failed import before retrying.'),
    'high','open',
    jsonb_build_object('report_type',i.detected_report_type,'created_at',i.created_at),
    (select auth.uid()),now()
  from public.imports i
  where i.organization_id=p_organization_id
    and i.status='failed'
    and i.created_at >= now()-interval '30 days'
    and coalesce((i.metadata->>'rolled_back')::boolean,false)=false
  on conflict (organization_id,dedupe_key) do update
    set detail=excluded.detail,metadata=excluded.metadata,updated_at=now();

  update public.manager_tasks t
  set status='done',completed_at=coalesce(completed_at,now()),updated_at=now()
  where t.organization_id=p_organization_id and t.status in ('open','in_progress')
    and (
      (t.source_type='performance_alert' and not exists (
        select 1 from public.performance_alerts a
        where a.id::text=t.source_id and a.organization_id=t.organization_id and a.status<>'resolved'
      ))
      or
      (t.source_type='coaching_case' and not exists (
        select 1 from public.coaching_cases c
        where c.id::text=t.source_id and c.organization_id=t.organization_id and c.status<>'closed'
      ))
      or
      (t.source_type='data_quality' and not exists (
        select 1 from public.unmatched_driver_records u
        where u.organization_id=t.organization_id and u.status='open'
          and coalesce(u.site,'workspace')=coalesce(t.site,'workspace')
      ))
    );

  return v_count;
end;
$$;

create or replace function public.list_manager_tasks(
  p_organization_id uuid,
  p_status text default null,
  p_limit integer default 500
)
returns table(
  id uuid,driver_id uuid,driver_name text,trid text,site text,source_type text,source_id text,
  dedupe_key text,title text,detail text,priority text,status text,assigned_to uuid,assigned_name text,
  due_at timestamptz,metadata jsonb,created_at timestamptz,updated_at timestamptz,completed_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_workspace_member(p_organization_id)
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select t.id,t.driver_id,d.full_name,d.trid,coalesce(t.site,d.site),t.source_type,t.source_id,
         t.dedupe_key,t.title,t.detail,t.priority,t.status,t.assigned_to,p.full_name,
         t.due_at,t.metadata,t.created_at,t.updated_at,t.completed_at
  from public.manager_tasks t
  left join public.drivers d on d.id=t.driver_id
  left join public.profiles p on p.id=t.assigned_to
  where t.organization_id=p_organization_id
    and (p_status is null or t.status=p_status)
    and (t.driver_id is null or private.is_platform_privileged() or private.can_access_driver(t.organization_id,t.driver_id))
    and (t.site is null or private.is_platform_privileged() or private.can_access_site(t.organization_id,t.site))
  order by case t.priority when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
           case when t.due_at is not null and t.due_at<now() then 0 else 1 end,
           t.due_at nulls last,t.updated_at desc
  limit greatest(1,least(coalesce(p_limit,500),2000));
end;
$$;

create or replace function public.create_manager_task_from_signal(
  p_organization_id uuid,
  p_driver_id uuid,
  p_site text,
  p_source_type text,
  p_source_id text,
  p_dedupe_key text,
  p_title text,
  p_detail text default null,
  p_priority text default 'medium',
  p_due_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_coaching')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if p_driver_id is not null and not private.is_platform_privileged()
     and not private.can_access_driver(p_organization_id,p_driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;

  insert into public.manager_tasks(
    organization_id,driver_id,site,source_type,source_id,dedupe_key,title,detail,priority,status,
    due_at,metadata,created_by
  ) values (
    p_organization_id,p_driver_id,nullif(upper(btrim(coalesce(p_site,''))),''),coalesce(nullif(p_source_type,''),'signal'),
    p_source_id,coalesce(nullif(p_dedupe_key,''),gen_random_uuid()::text),
    coalesce(nullif(btrim(p_title),''),'Management action'),p_detail,
    case when p_priority in ('low','medium','high','critical') then p_priority else 'medium' end,
    'open',p_due_at,coalesce(p_metadata,'{}'::jsonb),(select auth.uid())
  )
  on conflict (organization_id,dedupe_key) do update
    set title=excluded.title,detail=excluded.detail,priority=excluded.priority,
        metadata=public.manager_tasks.metadata||excluded.metadata,updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_manager_task(
  p_task_id uuid,
  p_status text default null,
  p_assigned_to uuid default null,
  p_due_at timestamptz default null,
  p_detail text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_task public.manager_tasks%rowtype;
declare v_before jsonb;
begin
  select * into v_task from public.manager_tasks where id=p_task_id;
  if not found then raise exception 'Manager task not found'; end if;

  if not private.has_workspace_permission(v_task.organization_id,'manage_coaching')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if v_task.driver_id is not null and not private.is_platform_privileged()
     and not private.can_access_driver(v_task.organization_id,v_task.driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;
  if p_status is not null and p_status not in ('open','in_progress','done','dismissed') then
    raise exception 'Invalid task status';
  end if;

  v_before := to_jsonb(v_task);

  update public.manager_tasks
  set status=coalesce(p_status,status),
      assigned_to=case when p_assigned_to is not null then p_assigned_to else assigned_to end,
      due_at=coalesce(p_due_at,due_at),
      detail=coalesce(p_detail,detail),
      completed_at=case
        when coalesce(p_status,status) in ('done','dismissed') then coalesce(completed_at,now())
        when p_status is not null then null
        else completed_at end,
      updated_at=now()
  where id=p_task_id;

  perform public.write_audit_event(
    v_task.organization_id,'manager_task_update','manager_task',p_task_id::text,'Manager task updated',
    v_task.driver_id,v_task.site,null,v_before,
    (select to_jsonb(t) from public.manager_tasks t where t.id=p_task_id),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.review_manager_signal(
  p_organization_id uuid,
  p_driver_id uuid,
  p_site text,
  p_week_label text,
  p_signal_key text,
  p_title text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'manage_coaching')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  perform public.write_audit_event(
    p_organization_id,'manager_signal_reviewed','management_signal',p_signal_key,
    coalesce(nullif(p_title,''),'Management signal reviewed'),
    p_driver_id,p_site,p_week_label,'{}'::jsonb,
    jsonb_build_object('reviewed',true,'note',p_note),
    jsonb_build_object('signal_key',p_signal_key)
  );
end;
$$;

create or replace function public.list_coaching_assignees(p_organization_id uuid)
returns table(user_id uuid,email text,full_name text,role text,site_scope text[])
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'manage_coaching')
     and not private.has_workspace_permission(p_organization_id,'manage_team')
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
$$;

create or replace function public.open_coaching_case_direct(
  p_organization_id uuid,
  p_driver_id uuid,
  p_title text,
  p_reason text default null,
  p_metric text default null,
  p_priority text default 'medium',
  p_period_label text default null,
  p_signal_key text default null,
  p_template_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
declare v_site text;
begin
  if p_driver_id is null then raise exception 'Driver is required'; end if;
  if not private.has_workspace_permission(p_organization_id,'manage_coaching')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if not private.is_platform_privileged() and not private.can_access_driver(p_organization_id,p_driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;

  if p_signal_key is not null then
    select c.id into v_id
    from public.coaching_cases c
    where c.organization_id=p_organization_id and c.driver_id=p_driver_id and c.status<>'closed'
      and c.metadata->>'signal_key'=p_signal_key
    order by c.created_at desc limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  select site into v_site from public.drivers where id=p_driver_id and organization_id=p_organization_id;

  insert into public.coaching_cases(
    organization_id,driver_id,title,reason,metric,priority,status,created_by,due_at,follow_up_at,metadata
  ) values (
    p_organization_id,p_driver_id,coalesce(nullif(btrim(p_title),''),'Performance coaching'),
    nullif(btrim(p_reason),''),nullif(btrim(p_metric),''),
    case when p_priority in ('low','medium','high','critical') then p_priority else 'medium' end,
    'open',(select auth.uid()),now()+interval '7 days',now()+interval '7 days',
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object(
      'source','coaching_v3','signal_key',p_signal_key,'period_label',p_period_label,'template_id',p_template_id
    )
  ) returning id into v_id;

  perform public.write_audit_event(
    p_organization_id,'coaching_created','coaching_case',v_id::text,'Coaching case created',
    p_driver_id,v_site,p_period_label,'{}'::jsonb,
    jsonb_build_object('title',p_title,'metric',p_metric,'priority',p_priority,'template_id',p_template_id),
    jsonb_build_object('signal_key',p_signal_key)
  );

  return v_id;
end;
$$;

create or replace function public.update_coaching_case(
  p_case_id uuid,
  p_status text default null,
  p_priority text default null,
  p_assigned_to uuid default null,
  p_due_at timestamptz default null,
  p_follow_up_at timestamptz default null,
  p_outcome text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_case public.coaching_cases%rowtype;
  v_site text;
  v_before jsonb;
begin
  select * into v_case from public.coaching_cases where id=p_case_id;
  if not found then raise exception 'Coaching case not found'; end if;

  if not private.has_workspace_permission(v_case.organization_id,'manage_coaching')
     and not private.is_platform_privileged() then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if not private.is_platform_privileged() and not private.can_access_driver(v_case.organization_id,v_case.driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;

  if p_status is not null and p_status not in ('open','assigned','acknowledged','follow_up','improved','not_improved','closed') then
    raise exception 'Invalid coaching status';
  end if;
  if p_priority is not null and p_priority not in ('low','medium','high','critical') then
    raise exception 'Invalid coaching priority';
  end if;

  v_before:=to_jsonb(v_case);
  select site into v_site from public.drivers where id=v_case.driver_id;

  update public.coaching_cases
  set status=coalesce(p_status,status),
      priority=coalesce(p_priority,priority),
      assigned_to=case when p_assigned_to is not null then p_assigned_to else assigned_to end,
      due_at=coalesce(p_due_at,due_at),
      follow_up_at=coalesce(p_follow_up_at,follow_up_at),
      outcome=coalesce(p_outcome,outcome),
      acknowledged_at=case when coalesce(p_status,status)='acknowledged' and acknowledged_at is null then now() else acknowledged_at end,
      closed_at=case
        when coalesce(p_status,status)='closed' and closed_at is null then now()
        when p_status is not null and p_status<>'closed' then null
        else closed_at end,
      updated_at=now()
  where id=p_case_id;

  perform public.write_audit_event(
    v_case.organization_id,'coaching_updated','coaching_case',p_case_id::text,'Coaching case updated',
    v_case.driver_id,v_site,v_case.metadata->>'period_label',v_before,
    (select to_jsonb(c) from public.coaching_cases c where c.id=p_case_id),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.evaluate_coaching_case_improvement(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_case public.coaching_cases%rowtype;
  v_baseline public.driver_metrics%rowtype;
  v_follow public.driver_metrics%rowtype;
  v_baseline_value numeric;
  v_follow_value numeric;
  v_delta numeric;
  v_improved boolean;
  v_higher_better boolean := true;
  v_metric text;
begin
  select * into v_case from public.coaching_cases where id=p_case_id;
  if not found then raise exception 'Coaching case not found'; end if;

  if not public.is_workspace_member(v_case.organization_id)
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if not private.is_platform_privileged() and not private.can_access_driver(v_case.organization_id,v_case.driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;

  select * into v_baseline
  from public.driver_metrics dm
  where dm.organization_id=v_case.organization_id and dm.driver_id=v_case.driver_id
    and (
      (v_case.metadata->>'period_label' is not null and dm.week_label=v_case.metadata->>'period_label')
      or (v_case.metadata->>'period_label' is null and dm.period_end<=v_case.created_at::date)
    )
  order by case when dm.week_label=v_case.metadata->>'period_label' then 0 else 1 end,
           dm.period_end desc nulls last,dm.created_at desc
  limit 1;

  if v_baseline.id is null then
    select * into v_baseline
    from public.driver_metrics dm
    where dm.organization_id=v_case.organization_id and dm.driver_id=v_case.driver_id
    order by dm.period_end asc nulls last,dm.created_at asc
    limit 1;
  end if;

  if v_baseline.id is null then
    return jsonb_build_object('improved',null,'label','No baseline','detail','No driver metric period is available for this case.');
  end if;

  select * into v_follow
  from public.driver_metrics dm
  where dm.organization_id=v_case.organization_id and dm.driver_id=v_case.driver_id
    and (
      coalesce(dm.period_end,dm.period_start) > coalesce(v_baseline.period_end,v_baseline.period_start)
      or (coalesce(dm.period_end,dm.period_start)=coalesce(v_baseline.period_end,v_baseline.period_start) and dm.created_at>v_baseline.created_at)
    )
  order by dm.period_end asc nulls last,dm.created_at asc
  limit 1;

  if v_follow.id is null then
    return jsonb_build_object(
      'improved',null,'label','Waiting for next week','baseline_week',v_baseline.week_label,
      'detail','Import the next driver period to evaluate this coaching outcome automatically.'
    );
  end if;

  v_metric:=lower(coalesce(v_case.metric,''));
  if v_metric like '%fico%' or v_metric like '%mentor%' then
    v_baseline_value:=coalesce(v_baseline.mentor_score,v_baseline.ementor,v_baseline.fico);
    v_follow_value:=coalesce(v_follow.mentor_score,v_follow.ementor,v_follow.fico);
  elsif v_metric='dcr' or v_metric like '%dcr%' then
    v_baseline_value:=v_baseline.dcr; v_follow_value:=v_follow.dcr;
  elsif v_metric='pod' or v_metric like '%pod%' then
    v_baseline_value:=v_baseline.pod; v_follow_value:=v_follow.pod;
  elsif v_metric='cc' or v_metric like '%contact%' then
    v_baseline_value:=v_baseline.cc; v_follow_value:=v_follow.cc;
  elsif v_metric like '%concession%' then
    v_baseline_value:=v_baseline.concessions; v_follow_value:=v_follow.concessions; v_higher_better:=false;
  elsif v_metric like '%dsc%' then
    v_baseline_value:=v_baseline.dsc_dpmo; v_follow_value:=v_follow.dsc_dpmo; v_higher_better:=false;
  elsif v_metric like '%lor%' then
    v_baseline_value:=v_baseline.lor; v_follow_value:=v_follow.lor; v_higher_better:=false;
  elsif v_metric like '%cdf%' then
    v_baseline_value:=v_baseline.cdf_dpmo; v_follow_value:=v_follow.cdf_dpmo; v_higher_better:=false;
  elsif v_metric like '%score%' or v_metric like '%tier%' or v_metric='' then
    v_baseline_value:=private.driver_point_score(
      coalesce(v_baseline.mentor_score,v_baseline.ementor,v_baseline.fico),v_baseline.dcr,v_baseline.dsc_dpmo,
      v_baseline.lor,v_baseline.pod,v_baseline.cc,v_baseline.ce_dpmo,v_baseline.cdf_dpmo,v_baseline.psb,v_baseline.raw_data
    );
    v_follow_value:=private.driver_point_score(
      coalesce(v_follow.mentor_score,v_follow.ementor,v_follow.fico),v_follow.dcr,v_follow.dsc_dpmo,
      v_follow.lor,v_follow.pod,v_follow.cc,v_follow.ce_dpmo,v_follow.cdf_dpmo,v_follow.psb,v_follow.raw_data
    );
  else
    v_baseline_value:=private.driver_point_score(
      coalesce(v_baseline.mentor_score,v_baseline.ementor,v_baseline.fico),v_baseline.dcr,v_baseline.dsc_dpmo,
      v_baseline.lor,v_baseline.pod,v_baseline.cc,v_baseline.ce_dpmo,v_baseline.cdf_dpmo,v_baseline.psb,v_baseline.raw_data
    );
    v_follow_value:=private.driver_point_score(
      coalesce(v_follow.mentor_score,v_follow.ementor,v_follow.fico),v_follow.dcr,v_follow.dsc_dpmo,
      v_follow.lor,v_follow.pod,v_follow.cc,v_follow.ce_dpmo,v_follow.cdf_dpmo,v_follow.psb,v_follow.raw_data
    );
  end if;

  if v_baseline_value is null or v_follow_value is null then
    return jsonb_build_object(
      'improved',null,'label','Insufficient metric evidence','baseline_week',v_baseline.week_label,
      'follow_up_week',v_follow.week_label,'detail','The coached metric is missing in one of the comparison periods.'
    );
  end if;

  v_delta:=v_follow_value-v_baseline_value;
  v_improved:=case when v_higher_better then v_delta>0 else v_delta<0 end;

  return jsonb_build_object(
    'improved',v_improved,
    'label',case when v_improved then 'Improved next week' when v_delta=0 then 'No change' else 'Not improved yet' end,
    'baseline_week',v_baseline.week_label,'follow_up_week',v_follow.week_label,
    'baseline_value',v_baseline_value,'follow_up_value',v_follow_value,'delta',v_delta,
    'detail',case when v_higher_better then 'Higher is better for this coached metric.' else 'Lower is better for this coached metric.' end
  );
end;
$$;

create or replace function public.refresh_notification_events(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare v_count integer:=0;
begin
  if not public.is_workspace_member(p_organization_id)
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  insert into public.notification_events(
    organization_id,driver_id,site,category,severity,title,message,status,
    source_type,source_id,dedupe_key,action_target,metadata,updated_at
  )
  select
    a.organization_id,a.driver_id,a.site,'performance',
    case when a.severity in ('critical','high','medium','low') then a.severity else 'medium' end,
    a.title,a.message,'unread','performance_alert',a.id::text,'alert:'||a.id::text,'coaching',
    jsonb_build_object('metric',a.metric,'period_label',a.period_label,'actual',a.actual_value,'threshold',a.threshold),
    now()
  from public.performance_alerts a
  where a.organization_id=p_organization_id and a.status<>'resolved'
    and (private.is_platform_privileged() or a.driver_id is null or private.can_access_driver(a.organization_id,a.driver_id))
  on conflict (organization_id,dedupe_key) do update
    set title=excluded.title,message=excluded.message,severity=excluded.severity,site=excluded.site,
        metadata=excluded.metadata,updated_at=now();
  get diagnostics v_count=row_count;

  insert into public.notification_events(
    organization_id,driver_id,site,category,severity,title,message,status,
    source_type,source_id,dedupe_key,action_target,metadata,updated_at
  )
  select
    c.organization_id,c.driver_id,d.site,'coaching',
    case when c.due_at<now() then 'high' else 'medium' end,
    case when c.due_at<now() then 'Coaching overdue' else 'Coaching due soon' end,
    c.title,'unread','coaching_case',c.id::text,'coaching:'||c.id::text,'coaching',
    jsonb_build_object('due_at',c.due_at,'case_status',c.status,'metric',c.metric),now()
  from public.coaching_cases c
  join public.drivers d on d.id=c.driver_id
  where c.organization_id=p_organization_id and c.status<>'closed' and c.due_at is not null
    and c.due_at<=now()+interval '1 day'
    and (private.is_platform_privileged() or private.can_access_driver(c.organization_id,c.driver_id))
  on conflict (organization_id,dedupe_key) do update
    set title=excluded.title,message=excluded.message,severity=excluded.severity,metadata=excluded.metadata,updated_at=now();

  insert into public.notification_events(
    organization_id,category,severity,title,message,status,source_type,source_id,dedupe_key,action_target,metadata,updated_at
  )
  select i.organization_id,'imports','high','Import failed',i.file_name||': '||coalesce(i.error_message,'Review required'),
         'unread','import',i.id::text,'import-failed:'||i.id::text,'imports',
         jsonb_build_object('report_type',i.detected_report_type),now()
  from public.imports i
  where i.organization_id=p_organization_id and i.status='failed'
    and i.created_at>=now()-interval '14 days'
    and coalesce((i.metadata->>'rolled_back')::boolean,false)=false
  on conflict (organization_id,dedupe_key) do update
    set message=excluded.message,metadata=excluded.metadata,updated_at=now();

  insert into public.notification_events(
    organization_id,category,severity,title,message,status,source_type,source_id,dedupe_key,action_target,metadata,updated_at
  )
  select i.organization_id,'imports','low','Scorecard imported',
         i.file_name||' was stored successfully.','unread','import',i.id::text,'scorecard-import:'||i.id::text,'driver-scorecards',
         jsonb_build_object('report_type',i.detected_report_type,'period_end',i.period_end),now()
  from public.imports i
  where i.organization_id=p_organization_id and i.status='complete'
    and lower(coalesce(i.detected_report_type,'')) like '%scorecard%'
    and i.created_at>=now()-interval '7 days'
    and coalesce((i.metadata->>'rolled_back')::boolean,false)=false
  on conflict (organization_id,dedupe_key) do update
    set message=excluded.message,metadata=excluded.metadata,updated_at=now();

  insert into public.notification_events(
    organization_id,site,category,severity,title,message,status,source_type,source_id,dedupe_key,action_target,metadata,updated_at
  )
  select u.organization_id,u.site,'data_quality',
         case when count(*)>=20 then 'high' else 'medium' end,
         'Unmatched driver evidence',
         count(*)::text||' imported record'||case when count(*)=1 then '' else 's' end||' need identity resolution.',
         'unread','unmatched',coalesce(u.site,'workspace'),'unmatched:'||coalesce(u.site,'workspace'),'data-quality',
         jsonb_build_object('count',count(*)),now()
  from public.unmatched_driver_records u
  where u.organization_id=p_organization_id and u.status='open'
    and (private.is_platform_privileged() or u.site is null or private.can_access_site(u.organization_id,u.site))
  group by u.organization_id,u.site
  on conflict (organization_id,dedupe_key) do update
    set message=excluded.message,severity=excluded.severity,metadata=excluded.metadata,updated_at=now();

  with ranked as (
    select dm.*,d.full_name,d.trid,d.site,
           row_number() over(partition by dm.driver_id order by dm.period_end desc nulls last,dm.created_at desc) as rn,
           private.driver_point_score(
             coalesce(dm.mentor_score,dm.ementor,dm.fico),dm.dcr,dm.dsc_dpmo,dm.lor,dm.pod,dm.cc,
             dm.ce_dpmo,dm.cdf_dpmo,dm.psb,dm.raw_data
           ) as point_score
    from public.driver_metrics dm
    join public.drivers d on d.id=dm.driver_id
    where dm.organization_id=p_organization_id
  ), latest as (
    select * from ranked where rn=1
  )
  insert into public.notification_events(
    organization_id,driver_id,site,category,severity,title,message,status,
    source_type,source_id,dedupe_key,action_target,metadata,updated_at
  )
  select organization_id,driver_id,site,'scorecard',
         case when point_score<50 then 'critical' else 'high' end,
         case when point_score<50 then 'Poor driver scorecard' else 'Fair driver scorecard' end,
         full_name||' has Total Score '||round(point_score)::text||' in '||week_label||'.',
         'unread','driver_metric',driver_id::text,'tier:'||driver_id::text||':'||coalesce(week_label,'current'),'coaching',
         jsonb_build_object('score',point_score,'week_label',week_label),now()
  from latest
  where point_score<70
    and (private.is_platform_privileged() or private.can_access_driver(organization_id,driver_id))
  on conflict (organization_id,dedupe_key) do update
    set title=excluded.title,message=excluded.message,severity=excluded.severity,metadata=excluded.metadata,updated_at=now();

  with ranked as (
    select dm.*,d.full_name,d.trid,d.site,
           row_number() over(partition by dm.driver_id order by dm.period_end desc nulls last,dm.created_at desc) as rn
    from public.driver_metrics dm
    join public.drivers d on d.id=dm.driver_id
    where dm.organization_id=p_organization_id
  )
  insert into public.notification_events(
    organization_id,driver_id,site,category,severity,title,message,status,
    source_type,source_id,dedupe_key,action_target,metadata,updated_at
  )
  select organization_id,driver_id,site,'fico',
         case when coalesce(mentor_score,ementor,fico)<780 then 'critical'
              when coalesce(mentor_score,ementor,fico)<800 then 'high' else 'medium' end,
         'FICO below 815',
         full_name||' is at '||round(coalesce(mentor_score,ementor,fico))::text||' in '||week_label||'.',
         'unread','driver_metric',driver_id::text,'fico:'||driver_id::text||':'||coalesce(week_label,'current'),'coaching',
         jsonb_build_object('actual',coalesce(mentor_score,ementor,fico),'target',815,'week_label',week_label),now()
  from ranked where rn=1 and coalesce(mentor_score,ementor,fico)<815
    and (private.is_platform_privileged() or private.can_access_driver(organization_id,driver_id))
  on conflict (organization_id,dedupe_key) do update
    set message=excluded.message,severity=excluded.severity,metadata=excluded.metadata,updated_at=now();

  with ranked as (
    select dm.*,d.full_name,d.site,
           row_number() over(partition by dm.driver_id order by dm.period_end desc nulls last,dm.created_at desc) as rn
    from public.driver_metrics dm join public.drivers d on d.id=dm.driver_id
    where dm.organization_id=p_organization_id
  )
  insert into public.notification_events(
    organization_id,driver_id,site,category,severity,title,message,status,
    source_type,source_id,dedupe_key,action_target,metadata,updated_at
  )
  select organization_id,driver_id,site,'concessions',
         case when concessions>=5 then 'critical' when concessions>=3 then 'high' else 'medium' end,
         'Concessions require review',
         full_name||' has '||round(concessions)::text||' concession'||case when concessions=1 then '' else 's' end||' in '||week_label||'.',
         'unread','driver_metric',driver_id::text,'concessions:'||driver_id::text||':'||coalesce(week_label,'current'),'coaching',
         jsonb_build_object('actual',concessions,'week_label',week_label),now()
  from ranked where rn=1 and concessions>0
    and (private.is_platform_privileged() or private.can_access_driver(organization_id,driver_id))
  on conflict (organization_id,dedupe_key) do update
    set message=excluded.message,severity=excluded.severity,metadata=excluded.metadata,updated_at=now();

  with ranked as (
    select dm.*,d.full_name,d.site,
           row_number() over(partition by dm.driver_id order by dm.period_end desc nulls last,dm.created_at desc) as rn,
           private.driver_point_score(
             coalesce(dm.mentor_score,dm.ementor,dm.fico),dm.dcr,dm.dsc_dpmo,dm.lor,dm.pod,dm.cc,
             dm.ce_dpmo,dm.cdf_dpmo,dm.psb,dm.raw_data
           ) as point_score
    from public.driver_metrics dm join public.drivers d on d.id=dm.driver_id
    where dm.organization_id=p_organization_id
  ), paired as (
    select a.organization_id,a.driver_id,a.full_name,a.site,a.week_label as current_week,a.point_score as current_score,
           b.week_label as previous_week,b.point_score as previous_score
    from ranked a join ranked b on b.driver_id=a.driver_id and b.rn=2
    where a.rn=1
  )
  insert into public.notification_events(
    organization_id,driver_id,site,category,severity,title,message,status,
    source_type,source_id,dedupe_key,action_target,metadata,updated_at
  )
  select organization_id,driver_id,site,'scorecard','high','Driver dropped a scorecard tier',
         full_name||' moved from score '||round(previous_score)::text||' to '||round(current_score)::text||'.',
         'unread','driver_metric',driver_id::text,'tier-drop:'||driver_id::text||':'||coalesce(current_week,'current'),'coaching',
         jsonb_build_object('previous_score',previous_score,'current_score',current_score,'previous_week',previous_week,'current_week',current_week),now()
  from paired
  where private.score_tier_rank(current_score)>private.score_tier_rank(previous_score)
    and (private.is_platform_privileged() or private.can_access_driver(organization_id,driver_id))
  on conflict (organization_id,dedupe_key) do update
    set message=excluded.message,metadata=excluded.metadata,updated_at=now();

  with ranked as (
    select s.*,
           row_number() over(partition by s.site order by s.year desc,s.week desc,s.updated_at desc) as rn
    from public.site_scorecards s
    where s.organization_id=p_organization_id
  ), pair as (
    select a.organization_id,a.site,a.week_label,a.overall_score,b.week_label as previous_week,b.overall_score as previous_score
    from ranked a join ranked b on b.site=a.site and b.rn=2
    where a.rn=1
  )
  insert into public.notification_events(
    organization_id,site,category,severity,title,message,status,source_type,source_id,dedupe_key,action_target,metadata,updated_at
  )
  select organization_id,site,'site',
         case when previous_score-overall_score>=5 then 'high' else 'medium' end,
         site||' site score dropped',
         'Overall score moved from '||round(previous_score,2)::text||' to '||round(overall_score,2)::text||'.',
         'unread','site_scorecard',site,'site-drop:'||site||':'||coalesce(week_label,'current'),'manager-control',
         jsonb_build_object('previous_score',previous_score,'current_score',overall_score,'previous_week',previous_week,'current_week',week_label),now()
  from pair
  where overall_score is not null and previous_score is not null and overall_score<previous_score
    and (private.is_platform_privileged() or private.can_access_site(organization_id,site))
  on conflict (organization_id,dedupe_key) do update
    set message=excluded.message,severity=excluded.severity,metadata=excluded.metadata,updated_at=now();

  return v_count;
end;
$$;

create or replace function public.list_notification_events(
  p_organization_id uuid,
  p_status text default null,
  p_limit integer default 200
)
returns table(
  id uuid,driver_id uuid,driver_name text,trid text,site text,category text,severity text,
  title text,message text,status text,source_type text,source_id text,action_target text,
  metadata jsonb,created_at timestamptz,updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_workspace_member(p_organization_id)
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select n.id,n.driver_id,d.full_name,d.trid,coalesce(n.site,d.site),n.category,n.severity,
         n.title,n.message,n.status,n.source_type,n.source_id,n.action_target,n.metadata,n.created_at,n.updated_at
  from public.notification_events n
  left join public.drivers d on d.id=n.driver_id
  where n.organization_id=p_organization_id
    and (p_status is null or n.status=p_status)
    and (n.driver_id is null or private.is_platform_privileged() or private.can_access_driver(n.organization_id,n.driver_id))
    and (n.site is null or private.is_platform_privileged() or private.can_access_site(n.organization_id,n.site))
  order by case n.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 when 'low' then 4 else 5 end,
           n.created_at desc
  limit greatest(1,least(coalesce(p_limit,200),1000));
end;
$$;

create or replace function public.update_notification_status(p_notification_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_row public.notification_events%rowtype;
begin
  if p_status not in ('unread','read','reviewed','dismissed') then raise exception 'Invalid notification status'; end if;
  select * into v_row from public.notification_events where id=p_notification_id;
  if not found then raise exception 'Notification not found'; end if;
  if not public.is_workspace_member(v_row.organization_id) and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if v_row.driver_id is not null and not private.is_platform_privileged()
     and not private.can_access_driver(v_row.organization_id,v_row.driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;

  update public.notification_events
  set status=p_status,
      read_at=case when p_status in ('read','reviewed','dismissed') then coalesce(read_at,now()) else null end,
      reviewed_at=case when p_status='reviewed' then coalesce(reviewed_at,now()) when p_status='unread' then null else reviewed_at end,
      updated_at=now()
  where id=p_notification_id;
end;
$$;

create or replace function public.mark_all_notifications_read(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare v_count integer;
begin
  if not public.is_workspace_member(p_organization_id) and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  update public.notification_events n
  set status='read',read_at=coalesce(read_at,now()),updated_at=now()
  where n.organization_id=p_organization_id and n.status='unread'
    and (n.driver_id is null or private.is_platform_privileged() or private.can_access_driver(n.organization_id,n.driver_id))
    and (n.site is null or private.is_platform_privileged() or private.can_access_site(n.organization_id,n.site));
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.preview_import_rollback(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_import public.imports%rowtype;
declare v_driver_safe integer:=0;
declare v_driver_merged integer:=0;
declare v_direct integer:=0;
begin
  select * into v_import from public.imports where id=p_import_id;
  if not found then raise exception 'Import not found'; end if;

  if not private.has_workspace_permission(v_import.organization_id,'manage_imports')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  select count(*) into v_driver_safe
  from public.driver_metrics dm
  where dm.organization_id=v_import.organization_id and dm.source_import_id=p_import_id
    and jsonb_array_length(coalesce(dm.raw_data->'source_files','[]'::jsonb))<=1;

  select count(*) into v_driver_merged
  from public.driver_metrics dm
  where dm.organization_id=v_import.organization_id and dm.source_import_id=p_import_id
    and jsonb_array_length(coalesce(dm.raw_data->'source_files','[]'::jsonb))>1;

  select
    (select count(*) from public.site_scorecards s where s.organization_id=v_import.organization_id and s.source_import_id=p_import_id)
    +(select count(*) from public.feedback_events f where f.organization_id=v_import.organization_id and f.source_import_id=p_import_id)
    +(select count(*) from public.mentor_daily_snapshots m where m.organization_id=v_import.organization_id and m.source_import_id=p_import_id)
    +(select count(*) from public.unmatched_driver_records u where u.organization_id=v_import.organization_id and u.source_import_id=p_import_id)
  into v_direct;

  return jsonb_build_object(
    'driver_rows_safe',v_driver_safe,
    'merged_driver_rows',v_driver_merged,
    'direct_artifacts',v_direct,
    'already_rolled_back',coalesce((v_import.metadata->>'rolled_back')::boolean,false)
  );
end;
$$;

create or replace function public.rollback_import_v2(p_import_id uuid,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_import public.imports%rowtype;
declare v_count integer:=0;
declare v_deleted integer:=0;
declare v_skipped integer:=0;
declare v_before jsonb;
begin
  select * into v_import from public.imports where id=p_import_id;
  if not found then raise exception 'Import not found'; end if;

  if not private.has_workspace_permission(v_import.organization_id,'manage_imports')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  if coalesce((v_import.metadata->>'rolled_back')::boolean,false) then
    return jsonb_build_object('deleted_rows',0,'skipped_merged',0,'already_rolled_back',true);
  end if;

  v_before:=to_jsonb(v_import);

  select count(*) into v_skipped
  from public.driver_metrics dm
  where dm.organization_id=v_import.organization_id and dm.source_import_id=p_import_id
    and jsonb_array_length(coalesce(dm.raw_data->'source_files','[]'::jsonb))>1;

  delete from public.driver_metrics dm
  where dm.organization_id=v_import.organization_id and dm.source_import_id=p_import_id
    and jsonb_array_length(coalesce(dm.raw_data->'source_files','[]'::jsonb))<=1;
  get diagnostics v_count=row_count; v_deleted:=v_deleted+v_count;

  delete from public.site_scorecards s where s.organization_id=v_import.organization_id and s.source_import_id=p_import_id;
  get diagnostics v_count=row_count; v_deleted:=v_deleted+v_count;

  delete from public.feedback_events f where f.organization_id=v_import.organization_id and f.source_import_id=p_import_id;
  get diagnostics v_count=row_count; v_deleted:=v_deleted+v_count;

  delete from public.mentor_daily_snapshots m where m.organization_id=v_import.organization_id and m.source_import_id=p_import_id;
  get diagnostics v_count=row_count; v_deleted:=v_deleted+v_count;

  delete from public.unmatched_driver_records u where u.organization_id=v_import.organization_id and u.source_import_id=p_import_id;
  get diagnostics v_count=row_count; v_deleted:=v_deleted+v_count;

  update public.imports
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'rolled_back',true,'rolled_back_at',now(),'rolled_back_by',(select auth.uid()),
    'rollback_reason',p_reason,'rollback_deleted_rows',v_deleted,'rollback_skipped_merged',v_skipped
  )
  where id=p_import_id;

  perform public.write_audit_event(
    v_import.organization_id,'import_rollback','import',p_import_id::text,
    'Import rolled back',null,null,v_import.metadata->>'week_label',v_before,
    (select to_jsonb(i) from public.imports i where i.id=p_import_id),
    jsonb_build_object('deleted_rows',v_deleted,'skipped_merged',v_skipped,'reason',p_reason)
  );

  return jsonb_build_object('deleted_rows',v_deleted,'skipped_merged',v_skipped,'already_rolled_back',false);
end;
$$;

grant execute on function public.refresh_manager_tasks(uuid) to authenticated;
grant execute on function public.list_manager_tasks(uuid,text,integer) to authenticated;
grant execute on function public.create_manager_task_from_signal(uuid,uuid,text,text,text,text,text,text,text,timestamptz,jsonb) to authenticated;
grant execute on function public.update_manager_task(uuid,text,uuid,timestamptz,text) to authenticated;
grant execute on function public.review_manager_signal(uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.list_coaching_assignees(uuid) to authenticated;
grant execute on function public.open_coaching_case_direct(uuid,uuid,text,text,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.evaluate_coaching_case_improvement(uuid) to authenticated;
grant execute on function public.refresh_notification_events(uuid) to authenticated;
grant execute on function public.list_notification_events(uuid,text,integer) to authenticated;
grant execute on function public.update_notification_status(uuid,text) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
grant execute on function public.preview_import_rollback(uuid) to authenticated;
grant execute on function public.rollback_import_v2(uuid,text) to authenticated;

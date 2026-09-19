-- MetrixIQ enterprise authorization hardening
-- Applied to production Supabase on 2026-09-18.

alter table public.unmatched_driver_records
  add column if not exists site text;

update public.unmatched_driver_records
set site = nullif(btrim(payload #>> '{driver,site}'), '')
where site is null
  and nullif(btrim(payload #>> '{driver,site}'), '') is not null
  and upper(btrim(payload #>> '{driver,site}')) <> 'UNKNOWN';

drop policy if exists driver_aliases_select on public.driver_aliases;
create policy driver_aliases_select
on public.driver_aliases
for select to authenticated
using (
  private.is_platform_privileged()
  or private.can_access_driver(organization_id, driver_id)
);

drop policy if exists driver_aliases_insert on public.driver_aliases;
create policy driver_aliases_insert
on public.driver_aliases
for insert to authenticated
with check (
  private.is_platform_privileged()
  or (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_driver(organization_id, driver_id)
  )
);

drop policy if exists driver_aliases_update on public.driver_aliases;
create policy driver_aliases_update
on public.driver_aliases
for update to authenticated
using (
  private.is_platform_privileged()
  or (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_driver(organization_id, driver_id)
  )
)
with check (
  private.is_platform_privileged()
  or (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_driver(organization_id, driver_id)
  )
);

drop policy if exists unmatched_driver_records_select on public.unmatched_driver_records;
create policy unmatched_driver_records_select
on public.unmatched_driver_records
for select to authenticated
using (
  private.is_platform_privileged()
  or private.can_access_site(organization_id, site)
);

drop policy if exists unmatched_driver_records_insert on public.unmatched_driver_records;
create policy unmatched_driver_records_insert
on public.unmatched_driver_records
for insert to authenticated
with check (
  private.is_platform_privileged()
  or (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_site(organization_id, site)
  )
);

drop policy if exists unmatched_driver_records_update on public.unmatched_driver_records;
create policy unmatched_driver_records_update
on public.unmatched_driver_records
for update to authenticated
using (
  private.is_platform_privileged()
  or (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_site(organization_id, site)
  )
)
with check (
  private.is_platform_privileged()
  or (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_site(organization_id, site)
  )
);

create or replace function public.choose_free_plan(p_organization_id uuid)
returns table(plan text, subscription_status text, onboarding_completed boolean)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not private.is_platform_privileged()
     and not private.has_org_role(p_organization_id, array['owner','admin','manager']) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  update public.organizations
     set plan = 'free',
         subscription_status = 'free',
         trial_started_at = null,
         trial_ends_at = null,
         onboarding_completed = true,
         plan_chosen_at = coalesce(plan_chosen_at, now()),
         billing_updated_at = now(),
         updated_at = now()
   where id = p_organization_id;

  return query select 'free'::text, 'free'::text, true;
end;
$function$;

create or replace function public.start_workspace_trial(p_organization_id uuid)
returns table(plan text, subscription_status text, trial_ends_at timestamptz, onboarding_completed boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_end timestamptz;
begin
  if not private.is_platform_privileged()
     and not private.has_org_role(p_organization_id, array['owner','admin','manager']) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.organizations o
    where o.id = p_organization_id
      and (o.trial_started_at is not null or o.subscription_status in ('trialing','active'))
  ) then
    raise exception 'A trial or paid subscription has already been used for this workspace';
  end if;

  v_end := now() + interval '7 days';

  update public.organizations
     set plan = 'full',
         subscription_status = 'trialing',
         trial_started_at = now(),
         trial_ends_at = v_end,
         onboarding_completed = true,
         plan_chosen_at = coalesce(plan_chosen_at, now()),
         billing_updated_at = now(),
         updated_at = now()
   where id = p_organization_id;

  return query select 'full'::text, 'trialing'::text, v_end, true;
end;
$function$;

create or replace function public.resolve_driver_identity(
  p_organization_id uuid,
  p_driver_id uuid,
  p_full_name text,
  p_normalized_name text,
  p_name_signature text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_normalized text := btrim(coalesce(p_normalized_name, ''));
  v_signature text := btrim(coalesce(p_name_signature, ''));
  v_trid text;
begin
  if not private.is_platform_privileged()
     and (
       not private.has_org_role(p_organization_id, array['owner','admin','manager'])
       or not private.can_access_driver(p_organization_id, p_driver_id)
     ) then
    raise exception 'Not authorised to resolve driver identities' using errcode = '42501';
  end if;

  if char_length(v_name) < 3 or position(' ' in v_name) = 0 then
    raise exception 'Please enter the driver full name';
  end if;

  if v_normalized = '' or v_signature = '' then
    raise exception 'Invalid normalized driver name';
  end if;

  update public.drivers
     set full_name = v_name,
         updated_at = now()
   where id = p_driver_id
     and organization_id = p_organization_id
  returning trid into v_trid;

  if v_trid is null then
    raise exception 'Driver was not found in this workspace';
  end if;

  insert into public.driver_aliases(
    organization_id, driver_id, alias_type, alias_value, alias_normalized, confidence, source
  ) values
    (p_organization_id, p_driver_id, 'name', v_name, v_normalized, 1, 'manual resolution'),
    (p_organization_id, p_driver_id, 'mentor_name', v_name, v_signature, 1, 'manual resolution')
  on conflict (organization_id, alias_type, alias_normalized)
  do update set
    driver_id = excluded.driver_id,
    alias_value = excluded.alias_value,
    confidence = 1,
    source = 'manual resolution';

  return jsonb_build_object(
    'driver_id', p_driver_id,
    'trid', v_trid,
    'full_name', v_name,
    'saved', true
  );
end;
$function$;

create or replace function public.resolve_unmatched_driver_record(
  p_organization_id uuid,
  p_record_id uuid,
  p_driver_id uuid,
  p_alias_name text,
  p_normalized_name text,
  p_name_signature text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name text := regexp_replace(btrim(coalesce(p_alias_name, '')), '\s+', ' ', 'g');
  v_site text;
begin
  select u.site into v_site
  from public.unmatched_driver_records u
  where u.id = p_record_id
    and u.organization_id = p_organization_id;

  if not found then
    raise exception 'Unmatched record was not found in this workspace';
  end if;

  if not private.is_platform_privileged()
     and (
       not private.has_org_role(p_organization_id, array['owner','admin','manager'])
       or not private.can_access_site(p_organization_id, v_site)
       or not private.can_access_driver(p_organization_id, p_driver_id)
     ) then
    raise exception 'Not authorised to resolve imported records' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organization_id = p_organization_id
  ) then
    raise exception 'Target driver was not found in this workspace';
  end if;

  if v_name <> ''
     and btrim(coalesce(p_normalized_name,'')) <> ''
     and btrim(coalesce(p_name_signature,'')) <> '' then
    insert into public.driver_aliases(
      organization_id, driver_id, alias_type, alias_value, alias_normalized, confidence, source
    ) values
      (p_organization_id, p_driver_id, 'name', v_name, btrim(p_normalized_name), 1, 'manual data-quality resolution'),
      (p_organization_id, p_driver_id, 'mentor_name', v_name, btrim(p_name_signature), 1, 'manual data-quality resolution')
    on conflict (organization_id, alias_type, alias_normalized)
    do update set
      driver_id = excluded.driver_id,
      alias_value = excluded.alias_value,
      confidence = 1,
      source = 'manual data-quality resolution';
  end if;

  update public.unmatched_driver_records
     set status = 'resolved',
         matched_driver_id = p_driver_id,
         resolved_at = now()
   where id = p_record_id
     and organization_id = p_organization_id;

  return jsonb_build_object(
    'record_id', p_record_id,
    'driver_id', p_driver_id,
    'resolved', true
  );
end;
$function$;

create or replace function public.sync_driver_directory(p_organization_id uuid)
returns table(updated_names integer, updated_sites integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_names integer := 0;
  v_sites integer := 0;
  v_single_site text;
begin
  if not private.is_platform_privileged()
     and not private.has_org_role(p_organization_id, array['owner','admin','manager']) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  with best_name as (
    select distinct on (a.driver_id)
      a.driver_id,
      a.alias_value
    from public.driver_aliases a
    where a.organization_id = p_organization_id
      and a.alias_type in ('name','mentor_name')
      and a.alias_value is not null
      and btrim(a.alias_value) <> ''
      and lower(a.alias_value) not like 'unresolved%'
      and (
        private.is_platform_privileged()
        or private.can_access_driver(p_organization_id, a.driver_id)
      )
    order by a.driver_id,
      case when a.alias_type='name' then 0 else 1 end,
      a.confidence desc nulls last,
      length(a.alias_value) desc
  )
  update public.drivers d
     set full_name = b.alias_value,
         updated_at = now()
    from best_name b
   where d.id = b.driver_id
     and d.organization_id = p_organization_id
     and (
       private.is_platform_privileged()
       or private.can_access_driver(p_organization_id, d.id)
     )
     and (
       d.full_name is null
       or btrim(d.full_name)=''
       or lower(d.full_name) like 'unresolved%'
       or upper(d.full_name)=upper(d.trid)
     );
  get diagnostics v_names = row_count;

  select case when count(distinct d.site)=1 then min(d.site) else null end
    into v_single_site
  from public.drivers d
  where d.organization_id=p_organization_id
    and d.site is not null
    and btrim(d.site)<>''
    and (
      private.is_platform_privileged()
      or private.can_access_driver(p_organization_id, d.id)
    );

  if v_single_site is not null then
    update public.drivers d
       set site=v_single_site,
           updated_at=now()
     where d.organization_id=p_organization_id
       and (d.site is null or btrim(d.site)='')
       and (
         private.is_platform_privileged()
         or private.can_access_driver(p_organization_id, d.id)
       );
    get diagnostics v_sites = row_count;
  end if;

  return query select v_names, v_sites;
end;
$function$;

create or replace function public.get_command_center_summary(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_period_label text;
  v_period_key date;
  v_result jsonb;
begin
  if not private.is_platform_privileged()
     and not public.is_workspace_member(p_organization_id) then
    raise exception 'Not authorized to view command centre for this workspace' using errcode='42501';
  end if;

  select
    coalesce(nullif(btrim(dm.week_label), ''), to_char(coalesce(dm.period_end, dm.period_start, dm.created_at::date), 'YYYY-MM-DD')),
    coalesce(dm.period_end, dm.period_start, dm.created_at::date)
  into v_period_label, v_period_key
  from public.driver_metrics dm
  where dm.organization_id = p_organization_id
    and dm.driver_id is not null
    and (
      private.is_platform_privileged()
      or private.can_access_driver(p_organization_id, dm.driver_id)
    )
  order by coalesce(dm.period_end, dm.period_start, dm.created_at::date) desc, dm.created_at desc
  limit 1;

  with current_alerts as (
    select a.*
    from public.performance_alerts a
    where a.organization_id = p_organization_id
      and a.period_label = v_period_label
      and a.status in ('open','acknowledged')
      and (
        private.is_platform_privileged()
        or case
          when a.driver_id is not null then private.can_access_driver(p_organization_id, a.driver_id)
          else private.can_access_site(p_organization_id, a.site)
        end
      )
  ), alert_counts as (
    select
      count(*) as total,
      count(*) filter (where severity='critical') as critical,
      count(*) filter (where severity='high') as high,
      count(*) filter (where severity='medium') as medium,
      count(*) filter (where alert_type='iadc_below_target') as iadc,
      count(*) filter (where alert_type='fico_below_target') as fico,
      count(*) filter (where alert_type='dcr_drop') as dcr_drop,
      count(*) filter (where alert_type='repeat_concessions') as repeat_concessions,
      count(*) filter (where alert_type='performance_deterioration') as deteriorating
    from current_alerts
  ), coaching as (
    select
      count(*) filter (where c.status <> 'closed') as open_cases,
      count(*) filter (where c.status <> 'closed' and c.due_at is not null and c.due_at < now()) as overdue_cases,
      count(*) filter (where c.status='closed') as closed_cases
    from public.coaching_cases c
    where c.organization_id=p_organization_id
      and (
        private.is_platform_privileged()
        or private.can_access_driver(p_organization_id, c.driver_id)
      )
  ), priorities as (
    select coalesce(
      jsonb_agg(x order by x.rank_score desc, x.driver_name asc),
      '[]'::jsonb
    ) as rows
    from (
      select
        d.id as driver_id,
        d.full_name as driver_name,
        d.trid,
        d.site,
        count(*) as alert_count,
        count(*) filter (where a.severity='critical') as critical_count,
        count(*) filter (where a.severity='high') as high_count,
        count(*) filter (where a.severity='medium') as medium_count,
        sum(case a.severity when 'critical' then 100 when 'high' then 40 when 'medium' then 15 else 5 end) as rank_score,
        jsonb_agg(
          jsonb_build_object(
            'id',a.id,
            'type',a.alert_type,
            'metric',a.metric,
            'severity',a.severity,
            'title',a.title,
            'actual_value',a.actual_value,
            'threshold',a.threshold,
            'status',a.status
          )
          order by case a.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
                   a.created_at desc
        ) as alerts
      from current_alerts a
      join public.drivers d on d.id=a.driver_id
      group by d.id,d.full_name,d.trid,d.site
      order by rank_score desc, d.full_name asc
      limit 12
    ) x
  )
  select jsonb_build_object(
    'period_label', v_period_label,
    'period_key', v_period_key,
    'alerts', jsonb_build_object(
      'total', ac.total,
      'critical', ac.critical,
      'high', ac.high,
      'medium', ac.medium,
      'iadc', ac.iadc,
      'fico', ac.fico,
      'dcr_drop', ac.dcr_drop,
      'repeat_concessions', ac.repeat_concessions,
      'deteriorating', ac.deteriorating
    ),
    'coaching', jsonb_build_object(
      'open', c.open_cases,
      'overdue', c.overdue_cases,
      'closed', c.closed_cases
    ),
    'priority_drivers', p.rows,
    'generated_at', now()
  ) into v_result
  from alert_counts ac
  cross join coaching c
  cross join priorities p;

  return coalesce(v_result, jsonb_build_object(
    'period_label',v_period_label,
    'period_key',v_period_key,
    'alerts',jsonb_build_object(
      'total',0,'critical',0,'high',0,'medium',0,'iadc',0,'fico',0,
      'dcr_drop',0,'repeat_concessions',0,'deteriorating',0
    ),
    'coaching',jsonb_build_object('open',0,'overdue',0,'closed',0),
    'priority_drivers','[]'::jsonb,
    'generated_at',now()
  ));
end;
$function$;

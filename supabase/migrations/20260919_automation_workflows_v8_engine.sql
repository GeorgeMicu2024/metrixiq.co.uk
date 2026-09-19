-- MetrixIQ Automation & Workflow Engine V8 - Engine
-- Default rules, rule execution, SLA escalation and unified Action Center V2.

create or replace function private.automation_severity_rank(p_severity text)
returns integer
language sql
immutable
set search_path to ''
as $$
  select case lower(coalesce(p_severity,'medium'))
    when 'critical' then 5 when 'high' then 4 when 'medium' then 3 when 'low' then 2 else 1 end;
$$;

create or replace function public.ensure_default_automation_rules(p_organization_id uuid)
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

  perform public.ensure_default_workflow_config(p_organization_id);

  insert into public.automation_rules(
    organization_id,name,description,enabled,trigger_type,condition_config,action_type,action_config,
    schedule_mode,schedule_day,schedule_hour,next_run_at
  ) values
  (
    p_organization_id,'FICO Recovery < 815',
    'Start the FICO Recovery playbook when the latest FICO/eMentor result is below 815.',
    false,'fico_below','{"threshold":815}'::jsonb,'playbook',
    '{"playbook_key":"fico_recovery","priority":"high","title":"FICO Recovery required"}'::jsonb,
    'event',null,null,null
  ),
  (
    p_organization_id,'Poor Performance 2 Weeks',
    'Start formal recovery when Total Score remains below 70 for two consecutive stored periods.',
    false,'total_score_below','{"threshold":70,"consecutive_periods":2}'::jsonb,'playbook',
    '{"playbook_key":"poor_performance","priority":"high","title":"Two-week performance recovery"}'::jsonb,
    'event',null,null,null
  ),
  (
    p_organization_id,'Concession Review',
    'Create a manager task when the latest scorecard records one or more concessions.',
    false,'concessions_above','{"threshold":0}'::jsonb,'manager_task',
    '{"priority":"high","due_hours":24,"title":"Concession evidence review"}'::jsonb,
    'event',null,null,null
  ),
  (
    p_organization_id,'DCR WoW Drop >= 0.5pp',
    'Notify management when DCR falls by at least 0.5 percentage points versus the previous stored period.',
    false,'dcr_wow_drop','{"threshold":0.5}'::jsonb,'notification',
    '{"priority":"high","title":"DCR week-on-week deterioration"}'::jsonb,
    'event',null,null,null
  ),
  (
    p_organization_id,'Scorecard Data Stale',
    'Create an operational task when the Scorecard integration is stale or missing.',
    false,'stale_source','{"source_key":"scorecard"}'::jsonb,'manager_task',
    '{"priority":"critical","due_hours":12,"title":"Scorecard data freshness issue"}'::jsonb,
    'event',null,null,null
  ),
  (
    p_organization_id,'Overdue Coaching Escalation',
    'Escalate coaching cases that pass their due date.',
    false,'overdue_coaching','{}'::jsonb,'notification',
    '{"priority":"high","title":"Coaching case overdue"}'::jsonb,
    'event',null,null,null
  ),
  (
    p_organization_id,'Overdue Incident Escalation',
    'Escalate operational incidents that pass their due date.',
    false,'overdue_incident','{}'::jsonb,'notification',
    '{"priority":"high","title":"Incident investigation overdue"}'::jsonb,
    'event',null,null,null
  ),
  (
    p_organization_id,'Daily eMentor Brief',
    'Create a daily in-app digest reminder for eMentor/FICO review.',
    false,'scheduled_digest','{"digest":"mentor"}'::jsonb,'notification',
    '{"priority":"medium","title":"Daily eMentor management brief","message":"Review latest FICO/eMentor exceptions and coaching actions."}'::jsonb,
    'daily',null,18,private.next_automation_time('daily',null,18,now())
  ),
  (
    p_organization_id,'Monday Operations Brief',
    'Create the Monday morning operations review reminder.',
    false,'scheduled_digest','{"digest":"monday_operations"}'::jsonb,'notification',
    '{"priority":"medium","title":"Monday Operations Brief","message":"Review scorecards, stale data, incidents, coaching and manager action queue."}'::jsonb,
    'weekly',1,7,private.next_automation_time('weekly',1,7,now())
  ),
  (
    p_organization_id,'Weekly Executive Pack',
    'Create the weekly management-report generation reminder.',
    false,'scheduled_digest','{"digest":"weekly_report"}'::jsonb,'notification',
    '{"priority":"medium","title":"Weekly Executive Pack due","message":"Generate and save the current Weekly Executive Pack."}'::jsonb,
    'weekly',6,18,private.next_automation_time('weekly',6,18,now())
  )
  on conflict (organization_id,name) do nothing;
end;
$$;

create or replace function public.list_automation_rules(p_organization_id uuid)
returns setof public.automation_rules
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.ensure_default_automation_rules(p_organization_id);
  return query select * from public.automation_rules
  where organization_id=p_organization_id
  order by enabled desc,lower(name);
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
      and r.channel in ('email_digest','whatsapp_summary')
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

create or replace function private.emit_automation_action(
  p_rule_id uuid,
  p_driver_id uuid,
  p_site text,
  p_week_label text,
  p_entity_key text,
  p_title text,
  p_detail text,
  p_metric text,
  p_actual numeric
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_dedupe text;
  v_priority text;
  v_due_hours integer;
  v_count integer:=0;
  v_existing uuid;
  v_playbook_key text;
  v_message text;
begin
  select * into v_rule from public.automation_rules where id=p_rule_id;
  if not found then return false; end if;

  v_dedupe:='automation:'||v_rule.id::text||':'||coalesce(nullif(p_entity_key,''),'workspace')||':'||coalesce(nullif(p_week_label,''),'current');
  v_priority:=case when v_rule.action_config->>'priority' in ('low','medium','high','critical')
    then v_rule.action_config->>'priority' else 'medium' end;
  v_due_hours:=greatest(1,coalesce((v_rule.action_config->>'due_hours')::integer,48));
  v_message:=coalesce(nullif(v_rule.action_config->>'message',''),p_detail);

  if v_rule.action_type='manager_task' then
    insert into public.manager_tasks(
      organization_id,driver_id,site,source_type,source_id,dedupe_key,title,detail,priority,status,due_at,metadata,created_by
    ) values (
      v_rule.organization_id,p_driver_id,p_site,'automation_rule',v_rule.id::text,v_dedupe,
      coalesce(nullif(v_rule.action_config->>'title',''),p_title),p_detail,v_priority,'open',
      now()+make_interval(hours=>v_due_hours),
      jsonb_build_object('automation_rule_id',v_rule.id,'metric',p_metric,'actual_value',p_actual,'week_label',p_week_label),
      (select auth.uid())
    )
    on conflict (organization_id,dedupe_key) do nothing;
    get diagnostics v_count=row_count;

  elsif v_rule.action_type='notification' then
    insert into public.notification_events(
      organization_id,driver_id,site,category,severity,title,message,status,source_type,source_id,dedupe_key,action_target,metadata
    ) values (
      v_rule.organization_id,p_driver_id,p_site,'automation',v_priority,
      coalesce(nullif(v_rule.action_config->>'title',''),p_title),v_message,'unread',
      'automation_rule',v_rule.id::text,v_dedupe,
      case
        when v_rule.trigger_type='overdue_coaching' then 'coaching'
        when v_rule.trigger_type='overdue_incident' then 'evidence'
        when v_rule.trigger_type='stale_source' then 'integrations'
        when v_rule.trigger_type='scheduled_digest' and v_rule.condition_config->>'digest'='weekly_report' then 'reports'
        when v_rule.trigger_type='scheduled_digest' and v_rule.condition_config->>'digest'='mentor' then 'mentor'
        else 'automation'
      end,
      jsonb_build_object('automation_rule_id',v_rule.id,'metric',p_metric,'actual_value',p_actual,'week_label',p_week_label)
    )
    on conflict (organization_id,dedupe_key) do nothing;
    get diagnostics v_count=row_count;

  elsif v_rule.action_type='coaching' and p_driver_id is not null then
    select c.id into v_existing
    from public.coaching_cases c
    where c.organization_id=v_rule.organization_id
      and c.driver_id=p_driver_id
      and c.status<>'closed'
      and c.metadata->>'automation_dedupe'=v_dedupe
    limit 1;

    if v_existing is null then
      insert into public.coaching_cases(
        organization_id,driver_id,title,reason,metric,priority,status,created_by,due_at,follow_up_at,metadata
      ) values (
        v_rule.organization_id,p_driver_id,
        coalesce(nullif(v_rule.action_config->>'title',''),p_title),p_detail,p_metric,v_priority,'open',
        (select auth.uid()),now()+make_interval(hours=>v_due_hours),now()+make_interval(hours=>v_due_hours),
        jsonb_build_object('source','automation_v8','automation_rule_id',v_rule.id,'automation_dedupe',v_dedupe,'week_label',p_week_label)
      );
      v_count:=1;
    end if;

  elsif v_rule.action_type='incident' then
    insert into public.operational_incidents(
      organization_id,driver_id,site,week_label,incident_type,severity,status,title,description,
      source_type,source_id,due_at,occurred_at,metadata,created_by
    ) values (
      v_rule.organization_id,p_driver_id,p_site,p_week_label,
      coalesce(nullif(v_rule.action_config->>'incident_type',''),'other'),v_priority,'open',
      coalesce(nullif(v_rule.action_config->>'title',''),p_title),p_detail,
      'automation_rule',v_dedupe,now()+make_interval(hours=>v_due_hours),now(),
      jsonb_build_object('automation_rule_id',v_rule.id,'metric',p_metric,'actual_value',p_actual),
      (select auth.uid())
    )
    on conflict (organization_id,source_type,source_id) where source_id is not null do nothing;
    get diagnostics v_count=row_count;

  elsif v_rule.action_type='playbook' then
    v_playbook_key:=coalesce(nullif(v_rule.action_config->>'playbook_key',''),'poor_performance');
    select public.start_playbook_workflow(
      v_rule.organization_id,v_playbook_key,p_driver_id,p_site,p_week_label,
      coalesce(nullif(v_rule.action_config->>'title',''),p_title),
      'automation_rule',v_rule.id::text,v_dedupe,null,
      jsonb_build_object('automation_rule_id',v_rule.id,'metric',p_metric,'actual_value',p_actual,'detail',p_detail)
    ) into v_existing;
    if v_existing is not null then v_count:=1; end if;

  elsif v_rule.action_type='approval' then
    select public.request_entity_approval(
      v_rule.organization_id,'automation_signal',p_entity_key,'automation_action',
      coalesce(nullif(v_rule.action_config->>'title',''),p_title),p_detail,v_priority,
      p_driver_id,p_site,v_dedupe,
      jsonb_build_object('automation_rule_id',v_rule.id,'metric',p_metric,'actual_value',p_actual,'week_label',p_week_label)
    ) into v_existing;
    if v_existing is not null then v_count:=1; end if;
  end if;

  if v_count>0 then
    perform private.queue_routed_delivery(
      v_rule.organization_id,'automation',v_priority,
      coalesce(nullif(v_rule.action_config->>'title',''),p_title),v_message,
      p_driver_id,p_site,v_dedupe,
      jsonb_build_object('rule_id',v_rule.id,'rule_name',v_rule.name,'week_label',p_week_label,'metric',p_metric,'actual_value',p_actual)
    );
  end if;

  return v_count>0;
end;
$$;

create or replace function public.run_automation_rule(p_rule_id uuid,p_force boolean default false)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_run_id uuid;
  v_match record;
  v_matched integer:=0;
  v_actions integer:=0;
  v_threshold numeric;
  v_periods integer;
  v_emitted boolean;
  v_due boolean;
begin
  select * into v_rule from public.automation_rules where id=p_rule_id;
  if not found then raise exception 'Rule not found'; end if;

  if coalesce((select auth.role()),'')<>'service_role'
     and not private.has_workspace_permission(v_rule.organization_id,'manage_automations')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  v_due:=p_force
    or (v_rule.enabled and v_rule.schedule_mode='event')
    or (v_rule.enabled and v_rule.schedule_mode in ('daily','weekly') and v_rule.next_run_at is not null and v_rule.next_run_at<=now());

  insert into public.automation_runs(
    organization_id,rule_id,status,triggered_by,context
  ) values (
    v_rule.organization_id,v_rule.id,
    case when v_due then 'running' else 'skipped' end,
    (select auth.uid()),
    jsonb_build_object('force',p_force,'trigger_type',v_rule.trigger_type,'schedule_mode',v_rule.schedule_mode)
  ) returning id into v_run_id;

  if not v_due then
    update public.automation_runs set finished_at=now() where id=v_run_id;
    return v_run_id;
  end if;

  begin
    v_threshold:=coalesce((v_rule.condition_config->>'threshold')::numeric,0);
    v_periods:=greatest(1,coalesce((v_rule.condition_config->>'consecutive_periods')::integer,1));

    if v_rule.trigger_type='fico_below' then
      for v_match in
        with ranked as (
          select dm.driver_id,d.site,dm.week_label,coalesce(dm.mentor_score,dm.ementor,dm.fico) as actual_value,
                 row_number() over(partition by dm.driver_id order by coalesce(dm.period_end,dm.period_start) desc nulls last,dm.created_at desc) rn
          from public.driver_metrics dm join public.drivers d on d.id=dm.driver_id
          where dm.organization_id=v_rule.organization_id
            and (v_rule.site is null or upper(btrim(d.site))=v_rule.site)
        )
        select * from ranked
        where rn=1 and actual_value is not null and actual_value<v_threshold
          and (private.is_platform_privileged() or private.can_access_driver(v_rule.organization_id,driver_id))
      loop
        v_matched:=v_matched+1;
        v_emitted:=private.emit_automation_action(
          v_rule.id,v_match.driver_id,v_match.site,v_match.week_label,v_match.driver_id::text,
          'FICO below '||v_threshold::text,
          'Latest FICO/eMentor is '||v_match.actual_value::text||', below the configured threshold of '||v_threshold::text||'.',
          'mentor',v_match.actual_value
        );
        if v_emitted then v_actions:=v_actions+1; end if;
      end loop;

    elsif v_rule.trigger_type='total_score_below' then
      for v_match in
        with scored as (
          select dm.driver_id,d.site,dm.week_label,
                 private.driver_point_score(
                   coalesce(dm.mentor_score,dm.ementor,dm.fico),dm.dcr,dm.dsc_dpmo,dm.lor,dm.pod,dm.cc,dm.ce_dpmo,dm.cdf_dpmo,dm.psb,dm.raw_data
                 ) as actual_value,
                 row_number() over(partition by dm.driver_id order by coalesce(dm.period_end,dm.period_start) desc nulls last,dm.created_at desc) rn
          from public.driver_metrics dm join public.drivers d on d.id=dm.driver_id
          where dm.organization_id=v_rule.organization_id
            and (v_rule.site is null or upper(btrim(d.site))=v_rule.site)
        ),
        qualified as (
          select driver_id
          from scored
          where rn<=v_periods
          group by driver_id
          having count(*)=v_periods and bool_and(actual_value is not null and actual_value<v_threshold)
        )
        select s.* from scored s join qualified q on q.driver_id=s.driver_id
        where s.rn=1
          and (private.is_platform_privileged() or private.can_access_driver(v_rule.organization_id,s.driver_id))
      loop
        v_matched:=v_matched+1;
        v_emitted:=private.emit_automation_action(
          v_rule.id,v_match.driver_id,v_match.site,v_match.week_label,v_match.driver_id::text,
          'Total Score below '||v_threshold::text||' for '||v_periods::text||' periods',
          'Total Score remains below the configured recovery threshold for consecutive stored periods.',
          'total_score',v_match.actual_value
        );
        if v_emitted then v_actions:=v_actions+1; end if;
      end loop;

    elsif v_rule.trigger_type='concessions_above' then
      for v_match in
        with ranked as (
          select dm.driver_id,d.site,dm.week_label,dm.concessions as actual_value,
                 row_number() over(partition by dm.driver_id order by coalesce(dm.period_end,dm.period_start) desc nulls last,dm.created_at desc) rn
          from public.driver_metrics dm join public.drivers d on d.id=dm.driver_id
          where dm.organization_id=v_rule.organization_id
            and (v_rule.site is null or upper(btrim(d.site))=v_rule.site)
        )
        select * from ranked
        where rn=1 and coalesce(actual_value,0)>v_threshold
          and (private.is_platform_privileged() or private.can_access_driver(v_rule.organization_id,driver_id))
      loop
        v_matched:=v_matched+1;
        v_emitted:=private.emit_automation_action(
          v_rule.id,v_match.driver_id,v_match.site,v_match.week_label,v_match.driver_id::text,
          'Concession evidence review',
          'Latest scorecard records '||v_match.actual_value::text||' concession(s).',
          'concessions',v_match.actual_value
        );
        if v_emitted then v_actions:=v_actions+1; end if;
      end loop;

    elsif v_rule.trigger_type='dcr_wow_drop' then
      for v_match in
        with ranked as (
          select dm.driver_id,d.site,dm.week_label,
                 case when dm.dcr between 0 and 1 then dm.dcr*100 else dm.dcr end as dcr_value,
                 row_number() over(partition by dm.driver_id order by coalesce(dm.period_end,dm.period_start) desc nulls last,dm.created_at desc) rn
          from public.driver_metrics dm join public.drivers d on d.id=dm.driver_id
          where dm.organization_id=v_rule.organization_id
            and (v_rule.site is null or upper(btrim(d.site))=v_rule.site)
        ),
        paired as (
          select a.driver_id,a.site,a.week_label,a.dcr_value as current_dcr,b.dcr_value as previous_dcr,
                 b.dcr_value-a.dcr_value as actual_value
          from ranked a join ranked b on b.driver_id=a.driver_id and b.rn=2
          where a.rn=1
        )
        select * from paired
        where current_dcr is not null and previous_dcr is not null and actual_value>=v_threshold
          and (private.is_platform_privileged() or private.can_access_driver(v_rule.organization_id,driver_id))
      loop
        v_matched:=v_matched+1;
        v_emitted:=private.emit_automation_action(
          v_rule.id,v_match.driver_id,v_match.site,v_match.week_label,v_match.driver_id::text,
          'DCR week-on-week deterioration',
          'DCR fell by '||round(v_match.actual_value,2)::text||' percentage points ('||round(v_match.previous_dcr,2)::text||'% → '||round(v_match.current_dcr,2)::text||'%).',
          'dcr',v_match.current_dcr
        );
        if v_emitted then v_actions:=v_actions+1; end if;
      end loop;

    elsif v_rule.trigger_type='stale_source' then
      for v_match in
        select h.source_key,h.label,h.freshness_status,h.age_hours
        from public.list_integration_health(v_rule.organization_id) h
        where h.source_key=coalesce(v_rule.condition_config->>'source_key','scorecard')
          and h.freshness_status in ('stale','missing')
      loop
        v_matched:=v_matched+1;
        v_emitted:=private.emit_automation_action(
          v_rule.id,null,v_rule.site,null,v_match.source_key,
          v_match.label||' data freshness issue',
          v_match.label||' is '||v_match.freshness_status||coalesce(' ('||v_match.age_hours::text||'h old).','.'),
          'data_freshness',v_match.age_hours
        );
        if v_emitted then v_actions:=v_actions+1; end if;
      end loop;

    elsif v_rule.trigger_type='overdue_coaching' then
      for v_match in
        select c.id,c.driver_id,d.site,(c.metadata->>'period_label') as week_label,
               extract(epoch from (now()-c.due_at))/3600.0 as actual_value,c.title
        from public.coaching_cases c join public.drivers d on d.id=c.driver_id
        where c.organization_id=v_rule.organization_id
          and c.status<>'closed' and c.due_at is not null and c.due_at<now()
          and (v_rule.site is null or upper(btrim(d.site))=v_rule.site)
          and (private.is_platform_privileged() or private.can_access_driver(v_rule.organization_id,c.driver_id))
      loop
        v_matched:=v_matched+1;
        v_emitted:=private.emit_automation_action(
          v_rule.id,v_match.driver_id,v_match.site,v_match.week_label,v_match.id::text,
          'Coaching case overdue',
          v_match.title||' is overdue by '||round(v_match.actual_value,1)::text||' hours.',
          'coaching_sla',v_match.actual_value
        );
        if v_emitted then v_actions:=v_actions+1; end if;
      end loop;

    elsif v_rule.trigger_type='overdue_incident' then
      for v_match in
        select i.id,i.driver_id,i.site,i.week_label,
               extract(epoch from (now()-i.due_at))/3600.0 as actual_value,i.title
        from public.operational_incidents i
        where i.organization_id=v_rule.organization_id
          and i.status not in ('resolved','closed') and i.due_at is not null and i.due_at<now()
          and (v_rule.site is null or upper(btrim(i.site))=v_rule.site)
          and (i.driver_id is null or private.is_platform_privileged() or private.can_access_driver(v_rule.organization_id,i.driver_id))
      loop
        v_matched:=v_matched+1;
        v_emitted:=private.emit_automation_action(
          v_rule.id,v_match.driver_id,v_match.site,v_match.week_label,v_match.id::text,
          'Incident investigation overdue',
          v_match.title||' is overdue by '||round(v_match.actual_value,1)::text||' hours.',
          'incident_sla',v_match.actual_value
        );
        if v_emitted then v_actions:=v_actions+1; end if;
      end loop;

    elsif v_rule.trigger_type='scheduled_digest' then
      v_matched:=1;
      v_emitted:=private.emit_automation_action(
        v_rule.id,null,v_rule.site,to_char(now(),'IYYY-"W"IW'),'scheduled',
        coalesce(nullif(v_rule.action_config->>'title',''),'Scheduled operations digest'),
        coalesce(nullif(v_rule.action_config->>'message',''),'Scheduled management review is due.'),
        'scheduled_digest',null
      );
      if v_emitted then v_actions:=1; end if;
    end if;

    update public.automation_rules
    set last_run_at=now(),
        next_run_at=case when schedule_mode in ('daily','weekly')
          then private.next_automation_time(schedule_mode,schedule_day,schedule_hour,now())
          else next_run_at end,
        updated_at=now()
    where id=v_rule.id;

    update public.automation_runs
    set status='succeeded',matched_count=v_matched,action_count=v_actions,finished_at=now(),
        context=context||jsonb_build_object('rule_name',v_rule.name)
    where id=v_run_id;

    perform public.write_audit_event(
      v_rule.organization_id,'automation_rule_run','automation_run',v_run_id::text,'Automation rule executed',
      null,v_rule.site,null,'{}'::jsonb,
      jsonb_build_object('rule_id',v_rule.id,'rule_name',v_rule.name,'matched_count',v_matched,'action_count',v_actions),
      jsonb_build_object('trigger_type',v_rule.trigger_type,'force',p_force)
    );
  exception when others then
    update public.automation_runs
    set status='failed',error_message=sqlerrm,finished_at=now()
    where id=v_run_id;
  end;

  return v_run_id;
end;
$$;

create or replace function public.run_automation_engine(
  p_organization_id uuid,
  p_force boolean default false,
  p_source text default 'manual'
)
returns table(rules_run integer,matched_count integer,action_count integer,failed_count integer)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_run uuid;
  v_status text;
  v_match integer;
  v_actions integer;
begin
  if coalesce((select auth.role()),'')<>'service_role'
     and not private.has_workspace_permission(p_organization_id,'manage_automations')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  if coalesce((select auth.role()),'')<>'service_role' then
    perform public.ensure_default_automation_rules(p_organization_id);
  end if;

  rules_run:=0;matched_count:=0;action_count:=0;failed_count:=0;

  for v_rule in
    select *
    from public.automation_rules
    where organization_id=p_organization_id
      and enabled=true
      and (
        p_force
        or schedule_mode='event'
        or (schedule_mode in ('daily','weekly') and next_run_at is not null and next_run_at<=now())
      )
    order by created_at
  loop
    v_run:=public.run_automation_rule(v_rule.id,p_force);
    select status,matched_count,action_count into v_status,v_match,v_actions
    from public.automation_runs where id=v_run;
    rules_run:=rules_run+1;
    matched_count:=matched_count+coalesce(v_match,0);
    action_count:=action_count+coalesce(v_actions,0);
    if v_status='failed' then failed_count:=failed_count+1; end if;
  end loop;

  return next;
end;
$$;

create or replace function public.list_action_center_v2(
  p_organization_id uuid,
  p_site text default null,
  p_limit integer default 1000
)
returns table(
  entity_type text,entity_id uuid,driver_id uuid,driver_name text,trid text,site text,
  title text,detail text,priority text,status text,due_at timestamptz,created_at timestamptz,
  assigned_to uuid,assigned_name text,source text,action_target text,
  sla_status text,sla_deadline timestamptz,overdue_hours numeric,metadata jsonb
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce((select auth.role()),'')<>'service_role'
     and not private.has_workspace_permission(p_organization_id,'view_workflows')
     and not private.has_workspace_permission(p_organization_id,'manage_coaching')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  with raw as (
    select 'manager_task'::text entity_type,t.id entity_id,t.driver_id,d.full_name driver_name,d.trid,
           coalesce(t.site,d.site) site,t.title,t.detail,t.priority,t.status,t.due_at,t.created_at,
           t.assigned_to,p.full_name assigned_name,t.source_type source,
           case when t.driver_id is not null then 'driver-profile' else 'manager-control' end action_target,t.metadata
    from public.manager_tasks t
    left join public.drivers d on d.id=t.driver_id
    left join public.profiles p on p.id=t.assigned_to
    where t.organization_id=p_organization_id and t.status not in ('done','dismissed')

    union all
    select 'coaching',c.id,c.driver_id,d.full_name,d.trid,d.site,c.title,c.reason,c.priority,c.status,c.due_at,c.created_at,
           c.assigned_to,p.full_name,'coaching','coaching',c.metadata
    from public.coaching_cases c
    join public.drivers d on d.id=c.driver_id
    left join public.profiles p on p.id=c.assigned_to
    where c.organization_id=p_organization_id and c.status<>'closed'

    union all
    select 'incident',i.id,i.driver_id,d.full_name,d.trid,coalesce(i.site,d.site),i.title,i.description,i.severity,i.status,i.due_at,i.created_at,
           i.assigned_to,p.full_name,'incident','evidence',i.metadata
    from public.operational_incidents i
    left join public.drivers d on d.id=i.driver_id
    left join public.profiles p on p.id=i.assigned_to
    where i.organization_id=p_organization_id and i.status not in ('resolved','closed')

    union all
    select 'approval',a.id,a.driver_id,d.full_name,d.trid,a.site,a.title,a.detail,a.priority,a.status,null,a.requested_at,
           null,null,'approval','automation',a.metadata
    from public.approval_requests a
    left join public.drivers d on d.id=a.driver_id
    where a.organization_id=p_organization_id and a.status='pending'

    union all
    select 'workflow',w.id,w.driver_id,d.full_name,d.trid,w.site,w.title,
           coalesce(s.title,'Workflow in progress'),
           case when w.status='waiting_approval' then 'high' else 'medium' end,
           w.status,w.due_at,w.created_at,w.assigned_to,p.full_name,
           coalesce(w.source_type,'workflow'),'automation',
           w.metadata||jsonb_build_object('current_step_id',s.id,'current_step_title',s.title,'current_step_type',s.step_type,'current_step_status',s.status)
    from public.workflow_instances w
    left join public.drivers d on d.id=w.driver_id
    left join public.profiles p on p.id=w.assigned_to
    left join public.workflow_step_runs s on s.workflow_instance_id=w.id and s.step_order=w.current_step
    where w.organization_id=p_organization_id and w.status not in ('completed','cancelled')
  ),
  scoped as (
    select r.*
    from raw r
    where (p_site is null or p_site='' or upper(btrim(r.site))=upper(btrim(p_site)))
      and (r.driver_id is null or private.is_platform_privileged() or private.can_access_driver(p_organization_id,r.driver_id))
      and (r.site is null or private.is_platform_privileged() or private.can_access_site(p_organization_id,r.site))
  )
  select s.entity_type,s.entity_id,s.driver_id,s.driver_name,s.trid,s.site,s.title,s.detail,s.priority,s.status,s.due_at,s.created_at,
         s.assigned_to,s.assigned_name,s.source,s.action_target,
         case
           when now()>coalesce(s.due_at,s.created_at+make_interval(hours=>coalesce(pol.resolution_hours,168))) then 'breached'
           when now()>coalesce(s.due_at,s.created_at+make_interval(hours=>coalesce(pol.resolution_hours,168)))-make_interval(hours=>coalesce(pol.escalation_hours,24)) then 'at_risk'
           else 'within_sla'
         end as sla_status,
         coalesce(s.due_at,s.created_at+make_interval(hours=>coalesce(pol.resolution_hours,168))) as sla_deadline,
         greatest(0,round(extract(epoch from (now()-coalesce(s.due_at,s.created_at+make_interval(hours=>coalesce(pol.resolution_hours,168)))))/3600.0,1)) as overdue_hours,
         s.metadata
  from scoped s
  left join lateral (
    select p.*
    from public.workflow_sla_policies p
    where p.organization_id=p_organization_id and p.enabled=true
      and p.entity_type=s.entity_type
      and (p.site is null or upper(btrim(p.site))=upper(btrim(s.site)))
      and (p.priority='any' or p.priority=s.priority)
    order by (p.site is not null) desc,(p.priority<>'any') desc,p.updated_at desc
    limit 1
  ) pol on true
  order by
    case when now()>coalesce(s.due_at,s.created_at+make_interval(hours=>coalesce(pol.resolution_hours,168))) then 0 else 1 end,
    private.automation_severity_rank(s.priority) desc,
    coalesce(s.due_at,s.created_at+make_interval(hours=>coalesce(pol.resolution_hours,168))),
    s.created_at
  limit greatest(1,least(coalesce(p_limit,1000),5000));
end;
$$;

create or replace function public.claim_action_center_item(p_entity_type text,p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_org uuid;
begin
  if p_entity_type='manager_task' then
    select organization_id into v_org from public.manager_tasks where id=p_entity_id;
  elsif p_entity_type='coaching' then
    select organization_id into v_org from public.coaching_cases where id=p_entity_id;
  elsif p_entity_type='incident' then
    select organization_id into v_org from public.operational_incidents where id=p_entity_id;
  elsif p_entity_type='workflow' then
    select organization_id into v_org from public.workflow_instances where id=p_entity_id;
  else
    raise exception 'This item type cannot be claimed';
  end if;
  if v_org is null then raise exception 'Action item not found'; end if;
  if not private.has_workspace_permission(v_org,'manage_workflows')
     and not private.has_workspace_permission(v_org,'manage_coaching')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  if p_entity_type='manager_task' then
    update public.manager_tasks set assigned_to=(select auth.uid()),status='in_progress',updated_at=now() where id=p_entity_id;
  elsif p_entity_type='coaching' then
    update public.coaching_cases set assigned_to=(select auth.uid()),status=case when status='open' then 'assigned' else status end,updated_at=now() where id=p_entity_id;
  elsif p_entity_type='incident' then
    update public.operational_incidents set assigned_to=(select auth.uid()),status=case when status='open' then 'investigating' else status end,updated_at=now() where id=p_entity_id;
  elsif p_entity_type='workflow' then
    update public.workflow_instances set assigned_to=(select auth.uid()),updated_at=now() where id=p_entity_id;
    update public.workflow_step_runs set assigned_to=(select auth.uid()),status=case when status='open' then 'in_progress' else status end,updated_at=now()
    where workflow_instance_id=p_entity_id and step_order=(select current_step from public.workflow_instances where id=p_entity_id);
  end if;

  perform public.write_audit_event(
    v_org,'action_claimed',p_entity_type,p_entity_id::text,'Action Center item claimed',
    null,null,null,'{}'::jsonb,jsonb_build_object('assigned_to',(select auth.uid())),'{}'::jsonb
  );
end;
$$;

create or replace function public.request_action_close_approval(p_entity_type text,p_entity_id uuid,p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_org uuid; v_driver uuid; v_site text; v_title text; v_id uuid;
begin
  if p_entity_type='coaching' then
    select organization_id,driver_id,(select site from public.drivers where id=c.driver_id),title
    into v_org,v_driver,v_site,v_title from public.coaching_cases c where id=p_entity_id;
  elsif p_entity_type='incident' then
    select organization_id,driver_id,site,title into v_org,v_driver,v_site,v_title from public.operational_incidents where id=p_entity_id;
  elsif p_entity_type='manager_task' then
    select organization_id,driver_id,site,title into v_org,v_driver,v_site,v_title from public.manager_tasks where id=p_entity_id;
  else
    raise exception 'Close approval is supported for coaching, incident and manager task items';
  end if;

  if v_org is null then raise exception 'Action item not found'; end if;

  select public.request_entity_approval(
    v_org,
    case p_entity_type when 'coaching' then 'coaching_case' when 'incident' then 'operational_incident' else 'manager_task' end,
    p_entity_id::text,'close',
    'Approve closure: '||v_title,
    coalesce(nullif(btrim(coalesce(p_note,'')),''),'Review evidence and approve closure.'),
    'high',v_driver,v_site,
    'close:'||p_entity_type||':'||p_entity_id::text,
    jsonb_build_object('source','action_center_v2')
  ) into v_id;
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
  v_step_order integer;
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
    select step_order into v_step_order from public.workflow_step_runs where id=v_req.workflow_step_id;
    if p_decision='approved' then
      update public.workflow_step_runs
      set status='completed',completed_at=now(),notes=coalesce(nullif(btrim(coalesce(p_note,'')),''),notes),updated_at=now()
      where id=v_req.workflow_step_id;
      perform private.advance_workflow_after_step(v_req.workflow_instance_id,v_step_order);
    else
      update public.workflow_step_runs
      set status='open',notes=coalesce(nullif(btrim(coalesce(p_note,'')),''),notes),updated_at=now()
      where id=v_req.workflow_step_id;
      update public.workflow_instances set status='in_progress',updated_at=now()
      where id=v_req.workflow_instance_id;
    end if;

  elsif p_decision='approved' and v_req.request_type='close' then
    if v_req.entity_type='coaching_case' then
      update public.coaching_cases
      set status='closed',closed_at=now(),outcome=coalesce(nullif(btrim(coalesce(p_note,'')),''),outcome),updated_at=now()
      where id=v_req.entity_id::uuid and organization_id=v_req.organization_id;
    elsif v_req.entity_type='operational_incident' then
      update public.operational_incidents
      set status='closed',resolved_at=coalesce(resolved_at,now()),outcome=coalesce(nullif(btrim(coalesce(p_note,'')),''),outcome),updated_at=now()
      where id=v_req.entity_id::uuid and organization_id=v_req.organization_id;
    elsif v_req.entity_type='manager_task' then
      update public.manager_tasks
      set status='done',completed_at=now(),updated_at=now()
      where id=v_req.entity_id::uuid and organization_id=v_req.organization_id;
    end if;
  end if;

  perform public.write_audit_event(
    v_req.organization_id,'approval_decided','approval_request',v_req.id::text,'Approval request '||p_decision,
    v_req.driver_id,v_req.site,null,
    jsonb_build_object('status',v_req.status),
    jsonb_build_object('status',p_decision,'decision_note',p_note),
    jsonb_build_object('entity_type',v_req.entity_type,'entity_id',v_req.entity_id,'request_type',v_req.request_type)
  );
end;
$$;

create or replace function public.refresh_sla_escalations(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare v_item record; v_count integer:=0; v_dedupe text; v_rows integer;
begin
  if coalesce((select auth.role()),'')<>'service_role'
     and not private.has_workspace_permission(p_organization_id,'manage_workflows')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  for v_item in
    select * from public.list_action_center_v2(p_organization_id,null,5000)
    where sla_status='breached'
  loop
    v_dedupe:='sla:'||v_item.entity_type||':'||v_item.entity_id::text||':'||to_char(now(),'YYYY-MM-DD');
    insert into public.notification_events(
      organization_id,driver_id,site,category,severity,title,message,status,source_type,source_id,dedupe_key,action_target,metadata
    ) values (
      p_organization_id,v_item.driver_id,v_item.site,'sla',
      case when v_item.overdue_hours>=48 then 'critical' else 'high' end,
      'SLA breached: '||v_item.title,
      v_item.entity_type||' is overdue by '||v_item.overdue_hours::text||' hours.','unread',
      'sla_engine',v_item.entity_id::text,v_dedupe,v_item.action_target,
      jsonb_build_object('entity_type',v_item.entity_type,'sla_deadline',v_item.sla_deadline,'overdue_hours',v_item.overdue_hours)
    )
    on conflict (organization_id,dedupe_key) do nothing;
    get diagnostics v_rows=row_count;
    v_count:=v_count+v_rows;

    if v_rows>0 then
      perform private.queue_routed_delivery(
        p_organization_id,'sla',
        case when v_item.overdue_hours>=48 then 'critical' else 'high' end,
        'SLA breached: '||v_item.title,
        v_item.entity_type||' is overdue by '||v_item.overdue_hours::text||' hours.',
        v_item.driver_id,v_item.site,v_dedupe,
        jsonb_build_object('entity_type',v_item.entity_type,'entity_id',v_item.entity_id,'overdue_hours',v_item.overdue_hours)
      );
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.run_due_automations_system()
returns table(
  organizations_checked integer,
  rules_run integer,
  matched_count integer,
  action_count integer,
  failed_count integer,
  sla_notifications integer
)
language plpgsql
security definer
set search_path to ''
as $automation_system$
declare
  v_org uuid;
  v_result record;
  v_sla integer;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  organizations_checked:=0;
  rules_run:=0;
  matched_count:=0;
  action_count:=0;
  failed_count:=0;
  sla_notifications:=0;

  for v_org in
    select distinct r.organization_id
    from public.automation_rules r
    where r.enabled=true
      and (
        (r.schedule_mode in ('daily','weekly') and r.next_run_at is not null and r.next_run_at<=now())
        or r.schedule_mode='event'
      )
    union
    select distinct organization_id from public.workflow_instances where status not in ('completed','cancelled')
    union
    select distinct organization_id from public.manager_tasks where status not in ('done','dismissed')
    union
    select distinct organization_id from public.coaching_cases where status<>'closed'
    union
    select distinct organization_id from public.operational_incidents where status not in ('resolved','closed')
  loop
    organizations_checked:=organizations_checked+1;

    if exists (
      select 1 from public.automation_rules r
      where r.organization_id=v_org and r.enabled=true
        and (
          r.schedule_mode='event'
          or (r.schedule_mode in ('daily','weekly') and r.next_run_at is not null and r.next_run_at<=now())
        )
    ) then
      select * into v_result
      from public.run_automation_engine(v_org,false,'system_cron');
      rules_run:=rules_run+coalesce(v_result.rules_run,0);
      matched_count:=matched_count+coalesce(v_result.matched_count,0);
      action_count:=action_count+coalesce(v_result.action_count,0);
      failed_count:=failed_count+coalesce(v_result.failed_count,0);
    end if;

    select public.refresh_sla_escalations(v_org) into v_sla;
    sla_notifications:=sla_notifications+coalesce(v_sla,0);
  end loop;

  return next;
end;
$automation_system$;

revoke all on function public.run_due_automations_system() from public;
revoke all on function public.run_due_automations_system() from authenticated;
grant execute on function public.run_due_automations_system() to service_role;

grant execute on function public.ensure_default_automation_rules(uuid) to authenticated;
grant execute on function public.run_automation_rule(uuid,boolean) to authenticated;
grant execute on function public.run_automation_engine(uuid,boolean,text) to authenticated;
grant execute on function public.list_action_center_v2(uuid,text,integer) to authenticated;
grant execute on function public.claim_action_center_item(text,uuid) to authenticated;
grant execute on function public.request_action_close_approval(text,uuid,text) to authenticated;
grant execute on function public.refresh_sla_escalations(uuid) to authenticated;

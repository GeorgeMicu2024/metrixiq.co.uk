-- Restrict workspace-wide notification mutations to workflow managers or platform privileged users.

create or replace function public.cleanup_stale_notification_events(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count integer := 0;
  v_changed integer := 0;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_workflows')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  -- Performance alerts are no longer actionable after the underlying alert resolves/disappears.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='performance_alert'
    and n.status not in ('reviewed','dismissed')
    and not exists (
      select 1
      from public.performance_alerts a
      where a.organization_id=n.organization_id
        and a.id::text=n.source_id
        and a.status<>'resolved'
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  -- Closed coaching cases remain in history but leave the active notification feed.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='coaching_case'
    and n.status not in ('reviewed','dismissed')
    and not exists (
      select 1
      from public.coaching_cases c
      where c.organization_id=n.organization_id
        and c.id::text=n.source_id
        and c.status<>'closed'
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  -- Identity notifications clear automatically when there is no matching open unmatched evidence.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='unmatched'
    and n.status not in ('reviewed','dismissed')
    and not exists (
      select 1
      from public.unmatched_driver_records u
      where u.organization_id=n.organization_id
        and u.status='open'
        and coalesce(u.site,'workspace')=coalesce(n.source_id,'workspace')
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  -- Rolled-back imports no longer require an active import notification.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='import'
    and n.status not in ('reviewed','dismissed')
    and exists (
      select 1
      from public.imports i
      where i.organization_id=n.organization_id
        and i.id::text=n.source_id
        and coalesce((i.metadata->>'rolled_back')::boolean,false)=true
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  -- Driver metric alerts are week-specific. Once a newer stored period exists they become history.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='driver_metric'
    and n.driver_id is not null
    and n.status not in ('reviewed','dismissed')
    and nullif(n.metadata->>'week_label','') is not null
    and exists (
      select 1
      from public.driver_metrics newer
      join public.driver_metrics current_period
        on current_period.organization_id=n.organization_id
       and current_period.driver_id=n.driver_id
       and current_period.week_label=n.metadata->>'week_label'
      where newer.organization_id=n.organization_id
        and newer.driver_id=n.driver_id
        and coalesce(newer.period_end,newer.period_start) >
            coalesce(current_period.period_end,current_period.period_start)
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  -- Site-score drops become historical after a newer site scorecard is stored.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='site_scorecard'
    and n.site is not null
    and n.status not in ('reviewed','dismissed')
    and nullif(n.metadata->>'current_week','') is not null
    and exists (
      select 1
      from public.site_scorecards newer
      join public.site_scorecards current_card
        on current_card.organization_id=n.organization_id
       and current_card.site=n.site
       and current_card.week_label=n.metadata->>'current_week'
      where newer.organization_id=n.organization_id
        and newer.site=n.site
        and (newer.year*100+newer.week) > (current_card.year*100+current_card.week)
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  return v_count;
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
  if not private.has_workspace_permission(p_organization_id,'manage_workflows')
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

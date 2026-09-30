
-- Daily eMentor Smart Import Production handoff.
-- Wrap the existing transactional commit so encrypted eMentor source identities
-- resolve through mentor_hash aliases or enter the existing reconciliation queue.

do $$
begin
  if to_regprocedure('private.smart_import_commit_core(jsonb,uuid)') is null then
    alter function private.smart_import_commit(jsonb,uuid) rename to smart_import_commit_core;
  end if;
end
$$;

create or replace function private.smart_import_commit_mentor_daily(
  p_payload jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
set search_path = private, public
as $$
declare
  v_org uuid;
  v_batch_id uuid;
  v_fingerprint text;
  v_records integer := 0;
  v_matched integer := 0;
  v_unmatched integer := 0;
  v_saved_snapshots integer := 0;
  v_saved_unmatched integer := 0;
  v_invalid integer := 0;
  v_site_breakdown jsonb := '[]'::jsonb;
begin
  v_org := nullif(p_payload->>'organizationId','')::uuid;
  v_batch_id := nullif(p_payload->'batch'->>'id','')::uuid;
  v_fingerprint := nullif(p_payload->'batch'->>'batchFingerprint','');

  if v_org is null or v_batch_id is null or v_fingerprint is null then
    raise exception 'Approved staging export is incomplete.';
  end if;

  create temporary table if not exists smart_import_mentor_daily_candidates(
    source_file_name text,
    source_import_id uuid,
    source_identity_key text,
    site text,
    report_date date,
    week_label text,
    mentor_score numeric,
    total_trips numeric,
    driver_payload jsonb,
    period_payload jsonb,
    driver_id uuid
  ) on commit drop;
  truncate smart_import_mentor_daily_candidates;

  insert into smart_import_mentor_daily_candidates(
    source_file_name,source_import_id,source_identity_key,site,report_date,week_label,
    mentor_score,total_trips,driver_payload,period_payload,driver_id
  )
  with files as (
    select file_name,targets,sites,period_key
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text,targets text[],sites text[],period_key text)
  ),
  records as (
    select source_file_name,report_type,site,payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text,report_type text,site text,payload jsonb)
  ),
  prepared as (
    select
      r.source_file_name,
      imp.id as source_import_id,
      coalesce(
        nullif(r.payload->'driver'->>'mentorHash',''),
        nullif(r.payload->'driver'->'details'->'mentor'->>'identityKey','')
      ) as source_identity_key,
      coalesce(
        upper(nullif(r.site,'')),
        upper(nullif(r.payload->'driver'->>'site','')),
        case when cardinality(coalesce(f.sites,'{}'::text[]))=1 then upper(f.sites[1]) end
      ) as site,
      case
        when coalesce(f.period_key,'') ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
          then f.period_key::date
        when substring(f.file_name from '(20[0-9]{2}[-_.][0-9]{2}[-_.][0-9]{2})') is not null
          then replace(replace(substring(f.file_name from '(20[0-9]{2}[-_.][0-9]{2}[-_.][0-9]{2})'),'.','-'),'_','-')::date
        else null
      end as report_date,
      nullif(r.payload->'period'->>'weekLabel','') as source_week_label,
      private.smart_import_num(coalesce(r.payload->'driver','{}'::jsonb),'mentor_score') as score_a,
      private.smart_import_num(coalesce(r.payload->'driver','{}'::jsonb),'ementor') as score_b,
      private.smart_import_num(coalesce(r.payload->'driver','{}'::jsonb),'fico') as score_c,
      private.smart_import_num(coalesce(r.payload->'driver'->'details'->'mentor','{}'::jsonb),'totalTrips') as total_trips,
      coalesce(r.payload->'driver','{}'::jsonb) as driver_payload,
      coalesce(r.payload->'period','{}'::jsonb) as period_payload
    from records r
    join files f on f.file_name=r.source_file_name
    left join lateral (
      select i.id
      from public.imports i
      where i.organization_id=v_org
        and i.file_name=f.file_name
        and i.metadata->>'staging_batch_id'=v_batch_id::text
      order by i.created_at desc
      limit 1
    ) imp on true
    where r.report_type='DRIVER_PERIOD'
      and 'mentor_daily_snapshots'=any(coalesce(f.targets,'{}'::text[]))
  )
  select
    p.source_file_name,
    p.source_import_id,
    p.source_identity_key,
    p.site,
    p.report_date,
    coalesce(
      p.source_week_label,
      case when p.report_date is not null
        then 'W' || lpad(extract(week from p.report_date)::int::text,2,'0')
        else null end
    ) as week_label,
    coalesce(p.score_a,p.score_b,p.score_c) as mentor_score,
    p.total_trips,
    p.driver_payload,
    p.period_payload,
    a.driver_id
  from prepared p
  left join public.driver_aliases a
    on a.organization_id=v_org
   and a.alias_type='mentor_hash'
   and a.alias_normalized=p.source_identity_key;

  select
    count(*)::int,
    count(*) filter (where source_identity_key is null or report_date is null)::int,
    count(*) filter (where source_identity_key is not null and report_date is not null and driver_id is not null)::int,
    count(*) filter (where source_identity_key is not null and report_date is not null and driver_id is null)::int
  into v_records,v_invalid,v_matched,v_unmatched
  from smart_import_mentor_daily_candidates;

  if v_invalid <> 0 then
    raise exception 'Daily eMentor batch contains records without a source identity or report date.';
  end if;

  insert into public.mentor_daily_snapshots(
    organization_id,driver_id,site,source_import_id,source_identity_key,
    report_date,week_label,mentor_score,raw_data
  )
  select
    v_org,
    c.driver_id,
    c.site,
    c.source_import_id,
    c.source_identity_key,
    c.report_date,
    c.week_label,
    c.mentor_score,
    jsonb_strip_nulls(jsonb_build_object(
      'mentor',c.driver_payload->'details'->'mentor',
      'source_files',coalesce(c.driver_payload->'sources','[]'::jsonb),
      'report_date',c.report_date,
      'import_mode','daily',
      'activity_site',c.site,
      'staging_batch_id',v_batch_id,
      'batch_fingerprint',v_fingerprint,
      'smart_import',true
    ))
  from smart_import_mentor_daily_candidates c
  where c.driver_id is not null
  on conflict (organization_id,site,report_date,source_identity_key)
  do update set
    driver_id=excluded.driver_id,
    source_import_id=coalesce(excluded.source_import_id,public.mentor_daily_snapshots.source_import_id),
    week_label=excluded.week_label,
    mentor_score=coalesce(excluded.mentor_score,public.mentor_daily_snapshots.mentor_score),
    raw_data=private.smart_import_merge_raw(public.mentor_daily_snapshots.raw_data,excluded.raw_data);

  get diagnostics v_saved_snapshots = row_count;

  insert into public.unmatched_driver_records(
    organization_id,source_import_id,report_type,week_label,raw_trid,raw_name,normalized_name,
    payload,status,matched_driver_id,site,reconciliation_key
  )
  select
    v_org,
    c.source_import_id,
    'mentor_daily',
    c.week_label,
    null,
    case
      when nullif(c.driver_payload->>'name','') is not null
       and lower(c.driver_payload->>'name') not in ('unresolved','unresolved driver')
      then c.driver_payload->>'name'
      else null
    end,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'reportDate',c.report_date,
      'score',c.mentor_score,
      'totalTrips',c.total_trips,
      'driver',c.driver_payload,
      'period',c.period_payload,
      'sourceFile',c.source_file_name,
      'stagingBatchId',v_batch_id,
      'batchFingerprint',v_fingerprint,
      'smartImport',true
    )),
    'open',
    null,
    c.site,
    c.source_identity_key
  from smart_import_mentor_daily_candidates c
  where c.driver_id is null
  on conflict do nothing;

  get diagnostics v_saved_unmatched = row_count;

  with files as (
    select file_name,targets,sites
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text,targets text[],sites text[])
  ),
  records as (
    select source_file_name,report_type,site,payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text,report_type text,site text,payload jsonb)
  ),
  resolved as (
    select
      coalesce(
        upper(nullif(r.site,'')),
        upper(nullif(r.payload->'driver'->>'site','')),
        upper(nullif(r.payload->>'site','')),
        case when cardinality(coalesce(f.sites,'{}'::text[]))=1 then upper(f.sites[1]) end
      ) as site,
      r.report_type,
      f.targets
    from records r
    join files f on f.file_name=r.source_file_name
  ),
  file_sites as (
    select upper(s.site) as site,count(distinct f.file_name)::int as files
    from files f
    cross join lateral unnest(coalesce(f.sites,'{}'::text[])) s(site)
    where nullif(s.site,'') is not null
    group by upper(s.site)
  ),
  record_counts as (
    select
      site,
      count(*) filter (
        where report_type='DRIVER_PERIOD'
          and 'driver_metrics'=any(coalesce(targets,'{}'::text[]))
      )::int as driver_metrics,
      count(*) filter (
        where report_type='DRIVER_PERIOD'
          and 'mentor_daily_snapshots'=any(coalesce(targets,'{}'::text[]))
      )::int as mentor_daily,
      count(*) filter (
        where report_type='FEEDBACK_EVENT'
          and 'feedback_events'=any(coalesce(targets,'{}'::text[]))
      )::int as feedback_events,
      count(*) filter (
        where report_type='SITE_SCORECARD'
          and 'site_scorecards'=any(coalesce(targets,'{}'::text[]))
      )::int as scorecards
    from resolved
    where site is not null
    group by site
  ),
  sites as (
    select site from file_sites
    union
    select site from record_counts
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'site',s.site,
      'files',coalesce(f.files,0),
      'driverMetrics',coalesce(r.driver_metrics,0),
      'mentorDaily',coalesce(r.mentor_daily,0),
      'feedbackEvents',coalesce(r.feedback_events,0),
      'scorecards',coalesce(r.scorecards,0),
      'records',
        coalesce(r.driver_metrics,0)+coalesce(r.mentor_daily,0)+
        coalesce(r.feedback_events,0)+coalesce(r.scorecards,0)
    )
    order by s.site
  ),'[]'::jsonb)
  into v_site_breakdown
  from sites s
  left join file_sites f on f.site=s.site
  left join record_counts r on r.site=s.site;

  insert into public.audit_events(
    organization_id,actor_id,event_type,entity_type,entity_id,action,
    before_data,after_data,metadata
  )
  values(
    v_org,p_actor,'smart_import_mentor_daily_commit','smart_import_batch',v_batch_id::text,
    'Smart Import daily eMentor evidence committed',
    '{}'::jsonb,
    jsonb_build_object(
      'records',v_records,
      'matched',v_matched,
      'unmatched',v_unmatched,
      'savedSnapshots',v_saved_snapshots,
      'savedUnmatched',v_saved_unmatched,
      'siteBreakdown',v_site_breakdown
    ),
    jsonb_build_object(
      'batch_fingerprint',v_fingerprint,
      'staging_batch_id',v_batch_id
    )
  );

  return jsonb_build_object(
    'records',v_records,
    'matched',v_matched,
    'unmatched',v_unmatched,
    'savedSnapshots',v_saved_snapshots,
    'savedUnmatched',v_saved_unmatched,
    'invalid',v_invalid,
    'siteBreakdown',v_site_breakdown
  );
end
$$;

create or replace function private.smart_import_commit(
  p_payload jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
set search_path = private, public
as $$
declare
  v_base jsonb;
  v_mentor jsonb;
  v_result jsonb;
  v_org uuid;
  v_batch_id uuid;
begin
  v_org := nullif(p_payload->>'organizationId','')::uuid;
  v_batch_id := nullif(p_payload->'batch'->>'id','')::uuid;

  v_base := private.smart_import_commit_core(p_payload,p_actor);
  v_mentor := private.smart_import_commit_mentor_daily(p_payload,p_actor);

  v_result := coalesce(v_base,'{}'::jsonb) || jsonb_build_object(
    'mentorDaily',coalesce(v_mentor,'{}'::jsonb),
    'siteBreakdown',coalesce(v_mentor->'siteBreakdown',v_base->'siteBreakdown','[]'::jsonb)
  );

  update private.smart_import_commits
  set summary=v_result
  where organization_id=v_org
    and staging_batch_id=v_batch_id;

  return v_result;
end
$$;

revoke all on function private.smart_import_commit_core(jsonb,uuid) from public,anon,authenticated;
revoke all on function private.smart_import_commit_mentor_daily(jsonb,uuid) from public,anon,authenticated;
revoke all on function private.smart_import_commit(jsonb,uuid) from public,anon,authenticated;

grant execute on function private.smart_import_commit_core(jsonb,uuid) to postgres,service_role;
grant execute on function private.smart_import_commit_mentor_daily(jsonb,uuid) to postgres,service_role;
grant execute on function private.smart_import_commit(jsonb,uuid) to postgres,service_role;

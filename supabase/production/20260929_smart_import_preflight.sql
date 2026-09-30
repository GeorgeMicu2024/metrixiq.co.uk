-- MetrixIQ Production.
-- Zero-write Smart Import preflight infrastructure.
-- This migration does NOT enable Production commit.

create table if not exists private.smart_import_commits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staging_batch_id uuid not null,
  batch_fingerprint text not null,
  actor_id uuid,
  status text not null default 'preflight'
    check (status in ('preflight','committed','failed','rolled_back')),
  import_ids uuid[] not null default '{}'::uuid[],
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  rolled_back_at timestamptz,
  unique (organization_id, staging_batch_id)
);

revoke all on table private.smart_import_commits from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.smart_import_preflight(p_payload jsonb, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public'
AS $function$
declare
  v_org uuid;
  v_batch_id uuid;
  v_fingerprint text;
  v_invalid_driver_ids integer := 0;
  v_unsupported_targets text[] := '{}'::text[];
  v_required_driver_trids integer := 0;
  v_existing_drivers integer := 0;
  v_missing_drivers integer := 0;
  v_metric_records integer := 0;
  v_metric_daily_skipped integer := 0;
  v_metric_updates integer := 0;
  v_metric_inserts integer := 0;
  v_feedback_records integer := 0;
  v_feedback_updates integer := 0;
  v_feedback_inserts integer := 0;
  v_scorecard_records integer := 0;
  v_scorecard_updates integer := 0;
  v_scorecard_inserts integer := 0;
  v_concession_records integer := 0;
  v_concession_updates integer := 0;
  v_concession_inserts integer := 0;
  v_mentor_daily_records integer := 0;
  v_mentor_daily_matched integer := 0;
  v_mentor_daily_unmatched integer := 0;
  v_mentor_daily_updates integer := 0;
  v_mentor_daily_inserts integer := 0;
  v_invalid_mentor_records integer := 0;
  v_import_files integer := 0;
  v_already_committed boolean := false;
begin
  v_org := nullif(p_payload->>'organizationId','')::uuid;
  v_batch_id := nullif(p_payload->'batch'->>'id','')::uuid;
  v_fingerprint := nullif(p_payload->'batch'->>'batchFingerprint','');

  if v_org is null or v_batch_id is null or v_fingerprint is null then
    raise exception 'Approved staging export is incomplete.';
  end if;

  if coalesce(p_payload->'batch'->>'status','') <> 'approved' then
    raise exception 'Only approved staging batches can be preflighted.';
  end if;

  select exists(
    select 1
    from private.smart_import_commits c
    where c.organization_id=v_org
      and c.staging_batch_id=v_batch_id
      and c.status='committed'
  ) into v_already_committed;

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, entity_key
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, entity_key text)
  )
  select count(*)::int
  into v_invalid_driver_ids
  from records r
  join files f on f.file_name=r.source_file_name
  where r.report_type='DRIVER_PERIOD'
    and (r.entity_key is null or r.entity_key !~ '^A[A-Z0-9]{8,}

  select coalesce(array_agg(distinct target order by target), '{}'::text[])
  into v_unsupported_targets
  from (
    select target
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb)) f(targets text[])
    cross join lateral unnest(coalesce(f.targets,'{}'::text[])) target
    where target not in (
      'imports',
      'driver_metrics',
      'feedback_events',
      'site_scorecards',
      'concessions_weekly_snapshots',
      'mentor_daily_snapshots'
    )
  ) q;

  select count(*)::int
  into v_import_files
  from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb)) f(file_name text);

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, entity_key, site, period_key, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, entity_key text, site text, period_key text, payload jsonb)
  ),
  metric_candidates as (
    select r.*
    from records r
    where r.report_type='DRIVER_PERIOD'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_array_length(coalesce(r.payload->'driver'->'sources','[]'::jsonb)) > 0
              then r.payload->'driver'->'sources'
            else jsonb_build_array(r.source_file_name)
          end
        ) src(file_name)
        join files f on f.file_name=src.file_name
        where 'driver_metrics'=any(coalesce(f.targets,'{}'::text[]))
      )
  )
  select count(distinct entity_key)::int, count(*)::int
  into v_required_driver_trids, v_metric_records
  from metric_candidates;

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, payload jsonb)
  )
  select count(*)::int
  into v_metric_daily_skipped
  from records r
  where r.report_type='DRIVER_PERIOD'
    and coalesce(r.payload->'period'->>'granularity','')<>'weekly'
    and exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_array_length(coalesce(r.payload->'driver'->'sources','[]'::jsonb)) > 0
            then r.payload->'driver'->'sources'
          else jsonb_build_array(r.source_file_name)
        end
      ) src(file_name)
      join files f on f.file_name=src.file_name
      where 'driver_metrics'=any(coalesce(f.targets,'{}'::text[]))
    );

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, entity_key, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, entity_key text, payload jsonb)
  ),
  trids as (
    select distinct r.entity_key as trid
    from records r
    where r.report_type='DRIVER_PERIOD'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_array_length(coalesce(r.payload->'driver'->'sources','[]'::jsonb)) > 0
              then r.payload->'driver'->'sources'
            else jsonb_build_array(r.source_file_name)
          end
        ) src(file_name)
        join files f on f.file_name=src.file_name
        where 'driver_metrics'=any(coalesce(f.targets,'{}'::text[]))
      )
  )
  select count(d.id)::int
  into v_existing_drivers
  from trids t
  join public.drivers d
    on d.organization_id=v_org
   and d.trid=t.trid;

  v_missing_drivers := greatest(0, v_required_driver_trids-v_existing_drivers);

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, entity_key, site, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, entity_key text, site text, payload jsonb)
  ),
  candidates as (
    select
      r.entity_key trid,
      upper(nullif(r.site,'')) site,
      coalesce(
        nullif(r.payload->'period'->>'weekLabel',''),
        case
          when r.payload->'period'->>'key' ~ '^20[0-9]{2}-W[0-9]{1,2}$'
          then regexp_replace(r.payload->'period'->>'key','^20[0-9]{2}-','')
        end
      ) week_label
    from records r
    where r.report_type='DRIVER_PERIOD'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_array_length(coalesce(r.payload->'driver'->'sources','[]'::jsonb)) > 0
              then r.payload->'driver'->'sources'
            else jsonb_build_array(r.source_file_name)
          end
        ) src(file_name)
        join files f on f.file_name=src.file_name
        where 'driver_metrics'=any(coalesce(f.targets,'{}'::text[]))
      )
  )
  select
    count(*) filter (where dm.id is not null)::int,
    count(*) filter (where dm.id is null)::int
  into v_metric_updates, v_metric_inserts
  from candidates c
  left join public.drivers d
    on d.organization_id=v_org and d.trid=c.trid
  left join public.driver_metrics dm
    on dm.organization_id=v_org
   and dm.driver_id=d.id
   and dm.site is not distinct from c.site
   and dm.week_label is not distinct from c.week_label;

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, payload jsonb)
  ),
  candidates as (
    select
      nullif(r.payload->>'trackingId','') tracking_id,
      nullif(r.payload->>'feedbackDate','')::date feedback_date
    from records r
    join files f on f.file_name=r.source_file_name
    where r.report_type='FEEDBACK_EVENT'
      and 'feedback_events'=any(coalesce(f.targets,'{}'::text[]))
      and nullif(r.payload->>'trackingId','') is not null
      and nullif(r.payload->>'feedbackDate','') is not null
  )
  select count(*)::int,
         count(*) filter (where e.id is not null)::int,
         count(*) filter (where e.id is null)::int
  into v_feedback_records, v_feedback_updates, v_feedback_inserts
  from candidates c
  left join public.feedback_events e
    on e.organization_id=v_org
   and e.tracking_id=c.tracking_id
   and e.feedback_date=c.feedback_date;

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, payload jsonb)
  ),
  candidates as (
    select
      upper(nullif(r.payload->>'site','')) site,
      nullif(r.payload->>'year','')::integer score_year,
      nullif(r.payload->>'week','')::integer score_week
    from records r
    join files f on f.file_name=r.source_file_name
    where r.report_type='SITE_SCORECARD'
      and 'site_scorecards'=any(coalesce(f.targets,'{}'::text[]))
      and nullif(r.payload->>'site','') is not null
      and nullif(r.payload->>'year','') is not null
      and nullif(r.payload->>'week','') is not null
  )
  select count(*)::int,
         count(*) filter (where s.id is not null)::int,
         count(*) filter (where s.id is null)::int
  into v_scorecard_records, v_scorecard_updates, v_scorecard_inserts
  from candidates c
  left join public.site_scorecards s
    on s.organization_id=v_org
   and s.site=c.site
   and s.year=c.score_year
   and s.week=c.score_week;

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, entity_key, site, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, entity_key text, site text, payload jsonb)
  ),
  candidates as (
    select
      upper(nullif(r.site,'')) site,
      nullif(r.payload->'period'->>'weekLabel','') week_label,
      r.entity_key driver_trid
    from records r
    where r.report_type='DRIVER_PERIOD'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_array_length(coalesce(r.payload->'driver'->'sources','[]'::jsonb)) > 0
              then r.payload->'driver'->'sources'
            else jsonb_build_array(r.source_file_name)
          end
        ) src(file_name)
        join files f on f.file_name=src.file_name
        where 'concessions_weekly_snapshots'=any(coalesce(f.targets,'{}'::text[]))
      )
  )
  select count(*)::int,
         count(*) filter (where cws.id is not null)::int,
         count(*) filter (where cws.id is null)::int
  into v_concession_records, v_concession_updates, v_concession_inserts
  from candidates c
  left join public.concessions_weekly_snapshots cws
    on cws.organization_id=v_org
   and cws.site=c.site
   and cws.week_label=c.week_label
   and cws.driver_trid=c.driver_trid;

  return jsonb_build_object(
    'ready',
      v_invalid_driver_ids=0
      and v_invalid_mentor_records=0
      and cardinality(v_unsupported_targets)=0
      and not v_already_committed,
    'alreadyCommitted',v_already_committed,
    'organizationId',v_org,
    'stagingBatchId',v_batch_id,
    'batchFingerprint',v_fingerprint,
    'invalidDriverIdentities',v_invalid_driver_ids,
    'invalidMentorRecords',v_invalid_mentor_records,
    'unsupportedTargets',to_jsonb(v_unsupported_targets),
    'imports',jsonb_build_object('files',v_import_files),
    'drivers',jsonb_build_object(
      'required',v_required_driver_trids,
      'existing',v_existing_drivers,
      'toCreate',v_missing_drivers
    ),
    'driverMetrics',jsonb_build_object(
      'records',v_metric_records,
      'inserts',v_metric_inserts,
      'updates',v_metric_updates,
      'dailyDetailSkipped',v_metric_daily_skipped
    ),
    'feedbackEvents',jsonb_build_object(
      'records',v_feedback_records,
      'inserts',v_feedback_inserts,
      'updates',v_feedback_updates
    ),
    'siteScorecards',jsonb_build_object(
      'records',v_scorecard_records,
      'inserts',v_scorecard_inserts,
      'updates',v_scorecard_updates
    ),
    'concessionsWeekly',jsonb_build_object(
      'records',v_concession_records,
      'inserts',v_concession_inserts,
      'updates',v_concession_updates
    ),
    'mentorDaily',jsonb_build_object(
      'records',v_mentor_daily_records,
      'matched',v_mentor_daily_matched,
      'unmatched',v_mentor_daily_unmatched,
      'inserts',v_mentor_daily_inserts,
      'updates',v_mentor_daily_updates,
      'invalid',v_invalid_mentor_records
    )
  );
end;
$function$
;

revoke all on function private.smart_import_preflight(jsonb,uuid) from public, anon, authenticated;
grant execute on function private.smart_import_preflight(jsonb,uuid) to postgres, service_role;
)
    and (
      'driver_metrics'=any(coalesce(f.targets,'{}'::text[]))
      or 'concessions_weekly_snapshots'=any(coalesce(f.targets,'{}'::text[]))
    );

  select coalesce(array_agg(distinct target order by target), '{}'::text[])
  into v_unsupported_targets
  from (
    select target
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb)) f(targets text[])
    cross join lateral unnest(coalesce(f.targets,'{}'::text[])) target
    where target not in (
      'imports',
      'driver_metrics',
      'feedback_events',
      'site_scorecards',
      'concessions_weekly_snapshots'
    )
  ) q;

  select count(*)::int
  into v_import_files
  from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb)) f(file_name text);

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, entity_key, site, period_key, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, entity_key text, site text, period_key text, payload jsonb)
  ),
  metric_candidates as (
    select r.*
    from records r
    where r.report_type='DRIVER_PERIOD'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_array_length(coalesce(r.payload->'driver'->'sources','[]'::jsonb)) > 0
              then r.payload->'driver'->'sources'
            else jsonb_build_array(r.source_file_name)
          end
        ) src(file_name)
        join files f on f.file_name=src.file_name
        where 'driver_metrics'=any(coalesce(f.targets,'{}'::text[]))
      )
  )
  select count(distinct entity_key)::int, count(*)::int
  into v_required_driver_trids, v_metric_records
  from metric_candidates;

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, payload jsonb)
  )
  select count(*)::int
  into v_metric_daily_skipped
  from records r
  where r.report_type='DRIVER_PERIOD'
    and coalesce(r.payload->'period'->>'granularity','')<>'weekly'
    and exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_array_length(coalesce(r.payload->'driver'->'sources','[]'::jsonb)) > 0
            then r.payload->'driver'->'sources'
          else jsonb_build_array(r.source_file_name)
        end
      ) src(file_name)
      join files f on f.file_name=src.file_name
      where 'driver_metrics'=any(coalesce(f.targets,'{}'::text[]))
    );

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, entity_key, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, entity_key text, payload jsonb)
  ),
  trids as (
    select distinct r.entity_key as trid
    from records r
    where r.report_type='DRIVER_PERIOD'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_array_length(coalesce(r.payload->'driver'->'sources','[]'::jsonb)) > 0
              then r.payload->'driver'->'sources'
            else jsonb_build_array(r.source_file_name)
          end
        ) src(file_name)
        join files f on f.file_name=src.file_name
        where 'driver_metrics'=any(coalesce(f.targets,'{}'::text[]))
      )
  )
  select count(d.id)::int
  into v_existing_drivers
  from trids t
  join public.drivers d
    on d.organization_id=v_org
   and d.trid=t.trid;

  v_missing_drivers := greatest(0, v_required_driver_trids-v_existing_drivers);

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, entity_key, site, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, entity_key text, site text, payload jsonb)
  ),
  candidates as (
    select
      r.entity_key trid,
      upper(nullif(r.site,'')) site,
      coalesce(
        nullif(r.payload->'period'->>'weekLabel',''),
        case
          when r.payload->'period'->>'key' ~ '^20[0-9]{2}-W[0-9]{1,2}$'
          then regexp_replace(r.payload->'period'->>'key','^20[0-9]{2}-','')
        end
      ) week_label
    from records r
    where r.report_type='DRIVER_PERIOD'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_array_length(coalesce(r.payload->'driver'->'sources','[]'::jsonb)) > 0
              then r.payload->'driver'->'sources'
            else jsonb_build_array(r.source_file_name)
          end
        ) src(file_name)
        join files f on f.file_name=src.file_name
        where 'driver_metrics'=any(coalesce(f.targets,'{}'::text[]))
      )
  )
  select
    count(*) filter (where dm.id is not null)::int,
    count(*) filter (where dm.id is null)::int
  into v_metric_updates, v_metric_inserts
  from candidates c
  left join public.drivers d
    on d.organization_id=v_org and d.trid=c.trid
  left join public.driver_metrics dm
    on dm.organization_id=v_org
   and dm.driver_id=d.id
   and dm.site is not distinct from c.site
   and dm.week_label is not distinct from c.week_label;

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, payload jsonb)
  ),
  candidates as (
    select
      nullif(r.payload->>'trackingId','') tracking_id,
      nullif(r.payload->>'feedbackDate','')::date feedback_date
    from records r
    join files f on f.file_name=r.source_file_name
    where r.report_type='FEEDBACK_EVENT'
      and 'feedback_events'=any(coalesce(f.targets,'{}'::text[]))
      and nullif(r.payload->>'trackingId','') is not null
      and nullif(r.payload->>'feedbackDate','') is not null
  )
  select count(*)::int,
         count(*) filter (where e.id is not null)::int,
         count(*) filter (where e.id is null)::int
  into v_feedback_records, v_feedback_updates, v_feedback_inserts
  from candidates c
  left join public.feedback_events e
    on e.organization_id=v_org
   and e.tracking_id=c.tracking_id
   and e.feedback_date=c.feedback_date;

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, payload jsonb)
  ),
  candidates as (
    select
      upper(nullif(r.payload->>'site','')) site,
      nullif(r.payload->>'year','')::integer score_year,
      nullif(r.payload->>'week','')::integer score_week
    from records r
    join files f on f.file_name=r.source_file_name
    where r.report_type='SITE_SCORECARD'
      and 'site_scorecards'=any(coalesce(f.targets,'{}'::text[]))
      and nullif(r.payload->>'site','') is not null
      and nullif(r.payload->>'year','') is not null
      and nullif(r.payload->>'week','') is not null
  )
  select count(*)::int,
         count(*) filter (where s.id is not null)::int,
         count(*) filter (where s.id is null)::int
  into v_scorecard_records, v_scorecard_updates, v_scorecard_inserts
  from candidates c
  left join public.site_scorecards s
    on s.organization_id=v_org
   and s.site=c.site
   and s.year=c.score_year
   and s.week=c.score_week;

  with files as (
    select file_name, targets
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[])
  ),
  records as (
    select source_file_name, report_type, entity_key, site, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, entity_key text, site text, payload jsonb)
  ),
  candidates as (
    select
      upper(nullif(r.site,'')) site,
      nullif(r.payload->'period'->>'weekLabel','') week_label,
      r.entity_key driver_trid
    from records r
    where r.report_type='DRIVER_PERIOD'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_array_length(coalesce(r.payload->'driver'->'sources','[]'::jsonb)) > 0
              then r.payload->'driver'->'sources'
            else jsonb_build_array(r.source_file_name)
          end
        ) src(file_name)
        join files f on f.file_name=src.file_name
        where 'concessions_weekly_snapshots'=any(coalesce(f.targets,'{}'::text[]))
      )
  )
  select count(*)::int,
         count(*) filter (where cws.id is not null)::int,
         count(*) filter (where cws.id is null)::int
  into v_concession_records, v_concession_updates, v_concession_inserts
  from candidates c
  left join public.concessions_weekly_snapshots cws
    on cws.organization_id=v_org
   and cws.site=c.site
   and cws.week_label=c.week_label
   and cws.driver_trid=c.driver_trid;

  with files as (
    select file_name, targets, sites, period_key, granularity
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb))
      f(file_name text, targets text[], sites text[], period_key text, granularity text)
  ),
  records as (
    select source_file_name, report_type, site, payload
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb))
      r(source_file_name text, report_type text, site text, payload jsonb)
  ),
  candidates as (
    select
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
      end as report_date
    from records r
    join files f on f.file_name=r.source_file_name
    where r.report_type='DRIVER_PERIOD'
      and 'mentor_daily_snapshots'=any(coalesce(f.targets,'{}'::text[]))
  ),
  resolved as (
    select
      c.*,
      a.driver_id,
      m.id as snapshot_id
    from candidates c
    left join public.driver_aliases a
      on a.organization_id=v_org
     and a.alias_type='mentor_hash'
     and a.alias_normalized=c.source_identity_key
    left join public.mentor_daily_snapshots m
      on m.organization_id=v_org
     and m.driver_id=a.driver_id
     and m.site is not distinct from c.site
     and m.report_date=c.report_date
     and m.source_identity_key=c.source_identity_key
  )
  select
    count(*)::int,
    count(*) filter (where source_identity_key is null or report_date is null)::int,
    count(*) filter (where source_identity_key is not null and report_date is not null and driver_id is not null)::int,
    count(*) filter (where source_identity_key is not null and report_date is not null and driver_id is null)::int,
    count(*) filter (where source_identity_key is not null and report_date is not null and driver_id is not null and snapshot_id is not null)::int,
    count(*) filter (where source_identity_key is not null and report_date is not null and driver_id is not null and snapshot_id is null)::int
  into
    v_mentor_daily_records,
    v_invalid_mentor_records,
    v_mentor_daily_matched,
    v_mentor_daily_unmatched,
    v_mentor_daily_updates,
    v_mentor_daily_inserts
  from resolved;

  return jsonb_build_object(
    'ready',
      v_invalid_driver_ids=0
      and cardinality(v_unsupported_targets)=0
      and not v_already_committed,
    'alreadyCommitted',v_already_committed,
    'organizationId',v_org,
    'stagingBatchId',v_batch_id,
    'batchFingerprint',v_fingerprint,
    'invalidDriverIdentities',v_invalid_driver_ids,
    'unsupportedTargets',to_jsonb(v_unsupported_targets),
    'imports',jsonb_build_object('files',v_import_files),
    'drivers',jsonb_build_object(
      'required',v_required_driver_trids,
      'existing',v_existing_drivers,
      'toCreate',v_missing_drivers
    ),
    'driverMetrics',jsonb_build_object(
      'records',v_metric_records,
      'inserts',v_metric_inserts,
      'updates',v_metric_updates,
      'dailyDetailSkipped',v_metric_daily_skipped
    ),
    'feedbackEvents',jsonb_build_object(
      'records',v_feedback_records,
      'inserts',v_feedback_inserts,
      'updates',v_feedback_updates
    ),
    'siteScorecards',jsonb_build_object(
      'records',v_scorecard_records,
      'inserts',v_scorecard_inserts,
      'updates',v_scorecard_updates
    ),
    'concessionsWeekly',jsonb_build_object(
      'records',v_concession_records,
      'inserts',v_concession_inserts,
      'updates',v_concession_updates
    )
  );
end;
$function$
;

revoke all on function private.smart_import_preflight(jsonb,uuid) from public, anon, authenticated;
grant execute on function private.smart_import_preflight(jsonb,uuid) to postgres, service_role;

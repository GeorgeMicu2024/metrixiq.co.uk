-- MetrixIQ Production Smart Import commit gate.
-- Transactional, idempotent handoff for approved + reconciled Staging batches.

create or replace function private.smart_import_num(p_json jsonb, p_key text)
returns numeric
language sql
immutable
as $$
  select case
    when nullif(p_json ->> p_key, '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (p_json ->> p_key)::numeric
    else null
  end
$$;

create or replace function private.smart_import_merge_raw(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
as $$
  with base as (
    select coalesce(p_old, '{}'::jsonb) || jsonb_strip_nulls(coalesce(p_new, '{}'::jsonb)) as value
  ),
  sources as (
    select distinct source
    from (
      select value as source
      from jsonb_array_elements_text(
        case when jsonb_typeof(coalesce(p_old, '{}'::jsonb)->'source_files')='array'
          then coalesce(p_old, '{}'::jsonb)->'source_files' else '[]'::jsonb end
      )
      union all
      select value as source
      from jsonb_array_elements_text(
        case when jsonb_typeof(coalesce(p_new, '{}'::jsonb)->'source_files')='array'
          then coalesce(p_new, '{}'::jsonb)->'source_files' else '[]'::jsonb end
      )
    ) s
    where nullif(source,'') is not null
  )
  select case
    when exists(select 1 from sources)
      then jsonb_set(
        (select value from base),
        '{source_files}',
        coalesce((select jsonb_agg(source order by source) from sources), '[]'::jsonb),
        true
      )
    else (select value from base)
  end
$$;

create or replace function private.smart_import_performance(
  p_dcr numeric,p_pod numeric,p_iadc numeric,p_mentor numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_total numeric := 0;
  v_count integer := 0;
begin
  if p_dcr is not null then v_total := v_total + least(105::numeric,(p_dcr/99.2::numeric)*100); v_count := v_count + 1; end if;
  if p_pod is not null then v_total := v_total + least(105::numeric,(p_pod/99.6::numeric)*100); v_count := v_count + 1; end if;
  if p_iadc is not null then v_total := v_total + least(105::numeric,(p_iadc/80::numeric)*100); v_count := v_count + 1; end if;
  if p_mentor is not null then v_total := v_total + least(105::numeric,(p_mentor/815::numeric)*100); v_count := v_count + 1; end if;
  if v_count=0 then return null; end if;
  return round(v_total/v_count);
end
$$;

create or replace function private.smart_import_risk(
  p_dcr numeric,p_pod numeric,p_iadc numeric,p_mentor numeric,p_cc numeric,p_concessions numeric
)
returns text
language plpgsql
immutable
as $$
declare
  v_points integer := 0;
begin
  if p_dcr is not null and p_dcr<99.2 then v_points:=v_points+2; end if;
  if p_pod is not null and p_pod<99.6 then v_points:=v_points+2; end if;
  if p_iadc is not null and p_iadc<80 then v_points:=v_points+2; end if;
  if p_mentor is not null and p_mentor<815 then v_points:=v_points+1; end if;
  if p_cc is not null and p_cc<98 then v_points:=v_points+1; end if;
  if p_concessions is not null and p_concessions>=3 then v_points:=v_points+2; end if;
  if v_points>=4 then return 'High'; end if;
  if v_points>=2 then return 'Medium'; end if;
  return 'Low';
end
$$;

create or replace function private.smart_import_issue(
  p_dcr numeric,p_pod numeric,p_iadc numeric,p_mentor numeric,p_cc numeric,p_concessions numeric
)
returns text
language plpgsql
immutable
as $$
begin
  if p_dcr is not null and p_dcr<99.2 then return 'DCR below 99.20% target'; end if;
  if p_pod is not null and p_pod<99.6 then return 'POD below 99.60% target'; end if;
  if p_iadc is not null and p_iadc<80 then return 'IADC below 80% target'; end if;
  if p_mentor is not null and p_mentor<815 then return 'Mentor score below 815'; end if;
  if p_cc is not null and p_cc<98 then return 'Contact Compliance below 98.00% target'; end if;
  if p_concessions is not null and p_concessions>=3 then return 'Repeated concessions'; end if;
  return 'No active concern';
end
$$;

create or replace function private.smart_import_commit(p_payload jsonb,p_actor uuid)
returns jsonb
language plpgsql
set search_path to 'private','public'
as $$
declare
  v_org uuid;
  v_batch_id uuid;
  v_fingerprint text;
  v_preflight jsonb;
  v_existing private.smart_import_commits%rowtype;
  v_commit_id uuid;
  v_import_id uuid;
  v_import_ids uuid[] := '{}'::uuid[];
  v_file record;
  v_period_start date;
  v_period_end date;
  v_now timestamptz := clock_timestamp();
  v_summary jsonb;
  v_site_breakdown jsonb;
begin
  v_org := nullif(p_payload->>'organizationId','')::uuid;
  v_batch_id := nullif(p_payload->'batch'->>'id','')::uuid;
  v_fingerprint := nullif(p_payload->'batch'->>'batchFingerprint','');

  if v_org is null or v_batch_id is null or v_fingerprint is null then
    raise exception 'Approved staging export is incomplete.';
  end if;

  if coalesce(p_payload->'batch'->>'status','')<>'approved'
     or coalesce(p_payload->'batch'->'metadata'->>'reconciliationStatus','')<>'passed'
     or coalesce(p_payload->'batch'->'metadata'->>'approvalStatus','')<>'passed' then
    raise exception 'Production commit requires an approved, reconciled staging batch.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || v_batch_id::text,0));

  select * into v_existing
  from private.smart_import_commits
  where organization_id=v_org and staging_batch_id=v_batch_id
  for update;

  if found and v_existing.batch_fingerprint<>v_fingerprint then
    raise exception 'Staging batch fingerprint changed after approval.';
  end if;

  if found and v_existing.status='committed' then
    return coalesce(v_existing.summary,'{}'::jsonb) || jsonb_build_object(
      'committed',true,'alreadyCommitted',true,'commitId',v_existing.id,
      'stagingBatchId',v_batch_id,'batchFingerprint',v_fingerprint,
      'importIds',to_jsonb(v_existing.import_ids),'committedAt',v_existing.committed_at
    );
  end if;

  v_preflight := private.smart_import_preflight(p_payload,p_actor);
  if not coalesce((v_preflight->>'ready')::boolean,false) then
    raise exception 'Production preflight is not ready for commit.';
  end if;

  insert into private.smart_import_commits(
    organization_id,staging_batch_id,batch_fingerprint,actor_id,status,summary
  )
  values(v_org,v_batch_id,v_fingerprint,p_actor,'preflight',jsonb_build_object('preflight',v_preflight))
  on conflict (organization_id,staging_batch_id)
  do update set actor_id=excluded.actor_id,batch_fingerprint=excluded.batch_fingerprint,
    status='preflight',summary=jsonb_build_object('preflight',v_preflight)
  returning id into v_commit_id;

  create temporary table if not exists smart_import_file_map(
    file_name text primary key,
    import_id uuid not null,
    targets text[] not null default '{}'::text[],
    sites text[] not null default '{}'::text[]
  ) on commit drop;
  truncate smart_import_file_map;

  create temporary table if not exists smart_import_metric_keys(
    driver_id uuid not null,site text,week_label text
  ) on commit drop;
  truncate smart_import_metric_keys;

  for v_file in
    select *
    from jsonb_to_recordset(coalesce(p_payload->'files','[]'::jsonb)) as f(
      file_name text,content_hash text,byte_size bigint,mime_type text,
      report_types text[],sites text[],period_key text,granularity text,
      confidence numeric,state text,row_count integer,targets text[],
      warnings jsonb,detection_evidence jsonb,metadata jsonb
    )
    where f.state in ('ready','warning')
    order by f.file_name
  loop
    v_period_start := null;
    v_period_end := null;
    if coalesce(v_file.period_key,'') ~ '^20[0-9]{2}-W[0-9]{2}$' then
      v_period_start := to_date(replace(v_file.period_key,'-W',''),'IYYYIW');
      v_period_end := v_period_start + 6;
    elsif coalesce(v_file.period_key,'') ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then
      v_period_start := v_file.period_key::date;
      v_period_end := v_period_start;
    end if;

    insert into public.imports(
      organization_id,uploaded_by,file_name,file_type,file_size_bytes,status,
      detected_report_type,period_start,period_end,metadata,completed_at,site
    )
    values(
      v_org,p_actor,v_file.file_name,
      lower(nullif(regexp_replace(v_file.file_name,'^.*\.','','g'),'')),
      v_file.byte_size,'complete',
      nullif(array_to_string(coalesce(v_file.report_types,'{}'::text[]),', '),''),
      v_period_start,v_period_end,
      jsonb_strip_nulls(
        coalesce(v_file.metadata,'{}'::jsonb) ||
        jsonb_build_object(
          'smart_import',true,'smart_import_version','commit-gate-v1',
          'staging_batch_id',v_batch_id,'batch_fingerprint',v_fingerprint,
          'content_hash',v_file.content_hash,'period_key',v_file.period_key,
          'granularity',v_file.granularity,'confidence',v_file.confidence,
          'targets',to_jsonb(coalesce(v_file.targets,'{}'::text[])),
          'sites',to_jsonb(coalesce(v_file.sites,'{}'::text[])),
          'warnings',coalesce(v_file.warnings,'[]'::jsonb),
          'detection_evidence',coalesce(v_file.detection_evidence,'{}'::jsonb)
        )
      ),
      v_now,
      case when cardinality(coalesce(v_file.sites,'{}'::text[]))=1 then upper(v_file.sites[1]) else null end
    )
    returning id into v_import_id;

    v_import_ids := array_append(v_import_ids,v_import_id);
    insert into smart_import_file_map(file_name,import_id,targets,sites)
    values(v_file.file_name,v_import_id,coalesce(v_file.targets,'{}'::text[]),coalesce(v_file.sites,'{}'::text[]));
  end loop;

  with records as (
    select *
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb)) as r(
      source_file_name text,report_type text,entity_key text,site text,period_key text,payload jsonb
    )
  ),
  candidates as (
    select distinct on (r.entity_key)
      r.entity_key as trid,
      case
        when nullif(btrim(r.payload->'driver'->>'name'),'') is not null
          and upper(btrim(r.payload->'driver'->>'name'))<>upper(r.entity_key)
          and lower(btrim(r.payload->'driver'->>'name'))<>'unresolved driver'
        then btrim(r.payload->'driver'->>'name')
        else 'Unresolved driver'
      end as full_name,
      coalesce(
        upper(nullif(r.site,'')),
        upper(nullif(r.payload->'driver'->>'site','')),
        case when cardinality(fm.sites)=1 then upper(fm.sites[1]) end
      ) as site
    from records r
    join smart_import_file_map fm on fm.file_name=r.source_file_name
    where r.report_type='DRIVER_PERIOD'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and 'driver_metrics'=any(fm.targets)
    order by r.entity_key
  )
  insert into public.drivers(organization_id,trid,full_name,site,status,updated_at)
  select v_org,trid,full_name,site,'active',v_now from candidates
  on conflict (organization_id,trid)
  do update set
    full_name=case
      when public.drivers.full_name='Unresolved driver' and excluded.full_name<>'Unresolved driver'
      then excluded.full_name else public.drivers.full_name end,
    site=coalesce(public.drivers.site,excluded.site),
    updated_at=v_now;

  with records as (
    select *
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb)) as r(
      source_file_name text,report_type text,entity_key text,site text,period_key text,payload jsonb
    )
  ),
  source as (
    select
      r.*,fm.import_id,fm.sites,d.id as driver_id,
      r.payload->'driver' as driver,
      coalesce(r.payload->'driver'->'rawMetrics','{}'::jsonb) as raw,
      coalesce(
        upper(nullif(r.site,'')),
        upper(nullif(r.payload->'driver'->>'site','')),
        case when cardinality(fm.sites)=1 then upper(fm.sites[1]) end
      ) as activity_site,
      coalesce(
        nullif(r.payload->'period'->>'weekLabel',''),
        case when r.payload->'period'->>'key' ~ '^20[0-9]{2}-W[0-9]{1,2}$'
          then regexp_replace(r.payload->'period'->>'key','^20[0-9]{2}-','') end
      ) as week_label
    from records r
    join smart_import_file_map fm on fm.file_name=r.source_file_name
    join public.drivers d on d.organization_id=v_org and d.trid=r.entity_key
    where r.report_type='DRIVER_PERIOD'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and 'driver_metrics'=any(fm.targets)
  ),
  prepared as (
    select
      v_org as organization_id,driver_id,activity_site as site,import_id as source_import_id,
      nullif(payload->'period'->>'periodStart','')::date as period_start,
      nullif(payload->'period'->>'periodEnd','')::date as period_end,
      week_label,
      private.smart_import_num(raw,'dcr') as dcr,
      private.smart_import_num(raw,'pod') as pod,
      private.smart_import_num(raw,'iadc') as iadc,
      private.smart_import_num(raw,'cc') as cc,
      coalesce(
        private.smart_import_num(raw,'mentor_score'),
        private.smart_import_num(driver,'mentor_score'),
        private.smart_import_num(driver,'ementor'),
        private.smart_import_num(driver,'fico')
      ) as mentor,
      private.smart_import_num(raw,'psb') as psb,
      private.smart_import_num(raw,'reattempts') as reattempts,
      private.smart_import_num(raw,'concessions') as concessions,
      private.smart_import_num(raw,'lor') as lor,
      private.smart_import_num(raw,'delivered')::bigint as delivered,
      private.smart_import_num(raw,'dnr_dpmo') as dnr_dpmo,
      private.smart_import_num(raw,'dsc_dpmo') as dsc_dpmo,
      private.smart_import_num(raw,'ce_dpmo') as ce_dpmo,
      private.smart_import_num(raw,'cdf_dpmo') as cdf_dpmo,
      private.smart_import_num(raw,'scorecard_score') as scorecard_score,
      nullif(driver->>'tier','') as tier,
      least(
        100,
        55
        + case when jsonb_typeof(driver->'sources')='array' then jsonb_array_length(driver->'sources') else 0 end*8
        + (select count(*) from jsonb_object_keys(raw))*3
        + case
            when nullif(btrim(driver->>'name'),'') is not null
              and upper(btrim(driver->>'name'))<>upper(entity_key)
              and lower(btrim(driver->>'name'))<>'unresolved driver'
            then 10 else 0 end
      )::numeric as data_confidence,
      jsonb_strip_nulls(
        raw || jsonb_build_object(
          'dwc',private.smart_import_num(raw,'dwc'),
          'phr',private.smart_import_num(raw,'phr'),
          'dnr',private.smart_import_num(raw,'dnr'),
          'rts',private.smart_import_num(raw,'rts'),
          'podFails',private.smart_import_num(raw,'podFails'),
          'ccFails',private.smart_import_num(raw,'ccFails'),
          'mentor',driver->'details'->'mentor',
          'pod_detail',driver->'details'->'pod',
          'dwc_detail',driver->'details'->'dwc',
          'compliance_summary',driver->'details'->'complianceSummary',
          'contact_compliance_detail',driver->'details'->'contactCompliance',
          'cdf_feedback_count',driver->'details'->'cdfFeedbackCount',
          'customer_escalation_incidents',driver->'details'->'customerEscalationIncidents',
          'source_files',case when jsonb_typeof(driver->'sources')='array' then driver->'sources' else '[]'::jsonb end,
          'activity_site',activity_site,'metric_granularity','weekly','calendar_week',week_label,
          'analysis_version','smart-import-v1','staging_batch_id',v_batch_id,'batch_fingerprint',v_fingerprint
        )
      ) as raw_data
    from source
    where week_label is not null
  ),
  saved as (
    insert into public.driver_metrics(
      organization_id,driver_id,site,source_import_id,period_start,period_end,week_label,
      dcr,pod,iadc,cc,fico,ementor,mentor_score,psb,reattempts,concessions,lor,delivered,
      dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,scorecard_score,tier,data_confidence,raw_data
    )
    select
      organization_id,driver_id,site,source_import_id,period_start,period_end,week_label,
      dcr,pod,iadc,cc,mentor,mentor,mentor,psb,reattempts,concessions,lor,delivered,
      dnr_dpmo,dsc_dpmo,ce_dpmo,cdf_dpmo,scorecard_score,tier,data_confidence,raw_data
    from prepared
    on conflict (organization_id,driver_id,site,week_label)
    do update set
      source_import_id=coalesce(excluded.source_import_id,public.driver_metrics.source_import_id),
      period_start=coalesce(excluded.period_start,public.driver_metrics.period_start),
      period_end=coalesce(excluded.period_end,public.driver_metrics.period_end),
      dcr=coalesce(excluded.dcr,public.driver_metrics.dcr),
      pod=coalesce(excluded.pod,public.driver_metrics.pod),
      iadc=coalesce(excluded.iadc,public.driver_metrics.iadc),
      cc=coalesce(excluded.cc,public.driver_metrics.cc),
      fico=coalesce(excluded.fico,public.driver_metrics.fico),
      ementor=coalesce(excluded.ementor,public.driver_metrics.ementor),
      mentor_score=coalesce(excluded.mentor_score,public.driver_metrics.mentor_score),
      psb=coalesce(excluded.psb,public.driver_metrics.psb),
      reattempts=coalesce(excluded.reattempts,public.driver_metrics.reattempts),
      concessions=coalesce(excluded.concessions,public.driver_metrics.concessions),
      lor=coalesce(excluded.lor,public.driver_metrics.lor),
      delivered=coalesce(excluded.delivered,public.driver_metrics.delivered),
      dnr_dpmo=coalesce(excluded.dnr_dpmo,public.driver_metrics.dnr_dpmo),
      dsc_dpmo=coalesce(excluded.dsc_dpmo,public.driver_metrics.dsc_dpmo),
      ce_dpmo=coalesce(excluded.ce_dpmo,public.driver_metrics.ce_dpmo),
      cdf_dpmo=coalesce(excluded.cdf_dpmo,public.driver_metrics.cdf_dpmo),
      scorecard_score=coalesce(excluded.scorecard_score,public.driver_metrics.scorecard_score),
      tier=coalesce(excluded.tier,public.driver_metrics.tier),
      data_confidence=nullif(greatest(coalesce(excluded.data_confidence,0),coalesce(public.driver_metrics.data_confidence,0)),0),
      raw_data=private.smart_import_merge_raw(public.driver_metrics.raw_data,excluded.raw_data)
    returning driver_id,site,week_label
  )
  insert into smart_import_metric_keys(driver_id,site,week_label)
  select driver_id,site,week_label from saved;

  update public.driver_metrics dm
  set
    performance=private.smart_import_performance(dm.dcr,dm.pod,dm.iadc,coalesce(dm.mentor_score,dm.ementor,dm.fico)),
    risk=private.smart_import_risk(dm.dcr,dm.pod,dm.iadc,coalesce(dm.mentor_score,dm.ementor,dm.fico),dm.cc,dm.concessions),
    issue=private.smart_import_issue(dm.dcr,dm.pod,dm.iadc,coalesce(dm.mentor_score,dm.ementor,dm.fico),dm.cc,dm.concessions)
  where dm.organization_id=v_org
    and exists(
      select 1 from smart_import_metric_keys k
      where k.driver_id=dm.driver_id and k.site is not distinct from dm.site and k.week_label is not distinct from dm.week_label
    );

  with records as (
    select *
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb)) as r(
      source_file_name text,report_type text,entity_key text,site text,period_key text,payload jsonb
    )
  ),
  prepared as (
    select
      v_org as organization_id,d.id as driver_id,fm.import_id as source_import_id,
      coalesce(
        upper(nullif(r.site,'')),upper(nullif(r.payload->>'site','')),
        case when cardinality(fm.sites)=1 then upper(fm.sites[1]) end
      ) as site,
      nullif(r.payload->'period'->>'year','')::integer as year,
      nullif(r.payload->'period'->>'week','')::integer as week,
      nullif(r.payload->'period'->>'weekLabel','') as week_label,
      nullif(r.payload->>'trackingId','') as tracking_id,
      nullif(r.payload->>'trid','') as trid_raw,
      nullif(r.payload->>'feedbackL0','') as feedback_l0,
      nullif(r.payload->>'feedbackL1','') as feedback_l1,
      nullif(r.payload->>'feedbackL2','') as feedback_l2,
      nullif(r.payload->>'feedbackDate','')::date as feedback_date,
      nullif(replace(r.payload->>'deliveryTime',' ','T'),'')::timestamptz as delivery_time,
      nullif(r.payload->>'city','') as city,
      nullif(r.payload->>'postalCode','') as postal_code,
      nullif(r.payload->>'contactCompliance','') as contact_compliance,
      nullif(r.payload->>'phrCompliance','') as phr_compliance,
      nullif(r.payload->>'phrSafePlace','') as phr_safe_place,
      nullif(r.payload->>'phrDeliveryLocation','') as phr_delivery_location,
      coalesce((r.payload->>'scannedOver25m')::boolean,false) as scanned_over_25m,
      coalesce((r.payload->>'dnrConcession')::boolean,false) as dnr_concession,
      jsonb_build_object(
        'source_file',r.source_file_name,
        'activity_site',coalesce(
          upper(nullif(r.site,'')),upper(nullif(r.payload->>'site','')),
          case when cardinality(fm.sites)=1 then upper(fm.sites[1]) end
        ),
        'staging_batch_id',v_batch_id,'batch_fingerprint',v_fingerprint,'smart_import',true
      ) as raw_data
    from records r
    join smart_import_file_map fm on fm.file_name=r.source_file_name
    left join public.drivers d on d.organization_id=v_org and d.trid=nullif(r.payload->>'trid','')
    where r.report_type='FEEDBACK_EVENT'
      and 'feedback_events'=any(fm.targets)
      and nullif(r.payload->>'trackingId','') is not null
      and nullif(r.payload->>'feedbackDate','') is not null
  )
  insert into public.feedback_events(
    organization_id,driver_id,source_import_id,site,year,week,week_label,
    tracking_id,trid_raw,feedback_l0,feedback_l1,feedback_l2,feedback_date,
    delivery_time,city,postal_code,contact_compliance,phr_compliance,
    phr_safe_place,phr_delivery_location,scanned_over_25m,dnr_concession,raw_data
  )
  select
    organization_id,driver_id,source_import_id,site,year,week,week_label,
    tracking_id,trid_raw,feedback_l0,feedback_l1,feedback_l2,feedback_date,
    delivery_time,city,postal_code,contact_compliance,phr_compliance,
    phr_safe_place,phr_delivery_location,scanned_over_25m,dnr_concession,raw_data
  from prepared
  on conflict (organization_id,tracking_id,feedback_date)
  do update set
    driver_id=coalesce(excluded.driver_id,public.feedback_events.driver_id),
    source_import_id=coalesce(excluded.source_import_id,public.feedback_events.source_import_id),
    site=coalesce(excluded.site,public.feedback_events.site),
    year=coalesce(excluded.year,public.feedback_events.year),
    week=coalesce(excluded.week,public.feedback_events.week),
    week_label=coalesce(excluded.week_label,public.feedback_events.week_label),
    trid_raw=coalesce(excluded.trid_raw,public.feedback_events.trid_raw),
    feedback_l0=coalesce(excluded.feedback_l0,public.feedback_events.feedback_l0),
    feedback_l1=coalesce(excluded.feedback_l1,public.feedback_events.feedback_l1),
    feedback_l2=coalesce(excluded.feedback_l2,public.feedback_events.feedback_l2),
    delivery_time=coalesce(excluded.delivery_time,public.feedback_events.delivery_time),
    city=coalesce(excluded.city,public.feedback_events.city),
    postal_code=coalesce(excluded.postal_code,public.feedback_events.postal_code),
    contact_compliance=coalesce(excluded.contact_compliance,public.feedback_events.contact_compliance),
    phr_compliance=coalesce(excluded.phr_compliance,public.feedback_events.phr_compliance),
    phr_safe_place=coalesce(excluded.phr_safe_place,public.feedback_events.phr_safe_place),
    phr_delivery_location=coalesce(excluded.phr_delivery_location,public.feedback_events.phr_delivery_location),
    scanned_over_25m=excluded.scanned_over_25m,
    dnr_concession=excluded.dnr_concession,
    raw_data=private.smart_import_merge_raw(public.feedback_events.raw_data,excluded.raw_data);

  with records as (
    select *
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb)) as r(
      source_file_name text,report_type text,entity_key text,site text,period_key text,payload jsonb
    )
  ),
  prepared as (
    select
      v_org as organization_id,fm.import_id as source_import_id,
      upper(nullif(coalesce(r.payload->>'site',r.site),'')) as site,
      nullif(r.payload->>'year','')::integer as year,
      nullif(r.payload->>'week','')::integer as week,
      coalesce(nullif(r.payload->>'weekLabel',''),'W' || lpad(r.payload->>'week',2,'0')) as week_label,
      private.smart_import_num(r.payload,'overallScore') as overall_score,
      nullif(r.payload->>'standing','') as standing,
      nullif(r.payload->>'siteRank','')::integer as site_rank,
      nullif(r.payload->>'rankDelta','')::integer as rank_delta,
      nullif(r.payload->>'safetyStanding','') as safety_standing,
      nullif(r.payload->>'deliveryQualityStanding','') as delivery_quality_standing,
      nullif(r.payload->>'capacityStanding','') as capacity_standing,
      nullif(r.payload->>'pickupQualityStanding','') as pickup_quality_standing,
      coalesce(r.payload->'metrics','{}'::jsonb) as metrics,
      coalesce(r.payload->'focusAreas','[]'::jsonb) as focus_areas,
      r.source_file_name as source_file
    from records r
    join smart_import_file_map fm on fm.file_name=r.source_file_name
    where r.report_type='SITE_SCORECARD'
      and 'site_scorecards'=any(fm.targets)
      and nullif(coalesce(r.payload->>'site',r.site),'') is not null
      and nullif(r.payload->>'year','') is not null
      and nullif(r.payload->>'week','') is not null
  )
  insert into public.site_scorecards(
    organization_id,source_import_id,site,year,week,week_label,overall_score,standing,
    site_rank,rank_delta,safety_standing,delivery_quality_standing,capacity_standing,
    pickup_quality_standing,metrics,focus_areas,source_file,updated_at
  )
  select
    organization_id,source_import_id,site,year,week,week_label,overall_score,standing,
    site_rank,rank_delta,safety_standing,delivery_quality_standing,capacity_standing,
    pickup_quality_standing,metrics,focus_areas,source_file,v_now
  from prepared
  on conflict (organization_id,site,year,week)
  do update set
    source_import_id=coalesce(excluded.source_import_id,public.site_scorecards.source_import_id),
    week_label=excluded.week_label,
    overall_score=coalesce(excluded.overall_score,public.site_scorecards.overall_score),
    standing=coalesce(excluded.standing,public.site_scorecards.standing),
    site_rank=coalesce(excluded.site_rank,public.site_scorecards.site_rank),
    rank_delta=coalesce(excluded.rank_delta,public.site_scorecards.rank_delta),
    safety_standing=coalesce(excluded.safety_standing,public.site_scorecards.safety_standing),
    delivery_quality_standing=coalesce(excluded.delivery_quality_standing,public.site_scorecards.delivery_quality_standing),
    capacity_standing=coalesce(excluded.capacity_standing,public.site_scorecards.capacity_standing),
    pickup_quality_standing=coalesce(excluded.pickup_quality_standing,public.site_scorecards.pickup_quality_standing),
    metrics=public.site_scorecards.metrics || excluded.metrics,
    focus_areas=case when excluded.focus_areas='[]'::jsonb then public.site_scorecards.focus_areas else excluded.focus_areas end,
    source_file=coalesce(excluded.source_file,public.site_scorecards.source_file),
    updated_at=v_now;

  with records as (
    select *
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb)) as r(
      source_file_name text,report_type text,entity_key text,site text,period_key text,payload jsonb
    )
  ),
  groups as (
    select distinct
      coalesce(
        upper(nullif(r.site,'')),upper(nullif(r.payload->'driver'->>'site','')),
        case when cardinality(fm.sites)=1 then upper(fm.sites[1]) end
      ) as site,
      nullif(r.payload->'period'->>'weekLabel','') as week_label
    from records r
    join smart_import_file_map fm on fm.file_name=r.source_file_name
    where r.report_type='DRIVER_PERIOD'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and 'concessions_weekly_snapshots'=any(fm.targets)
      and private.smart_import_num(coalesce(r.payload->'driver'->'rawMetrics','{}'::jsonb),'concessions') is not null
  )
  delete from public.concessions_weekly_snapshots c
  using groups g
  where c.organization_id=v_org and c.site=g.site and c.week_label=g.week_label;

  with records as (
    select *
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb)) as r(
      source_file_name text,report_type text,entity_key text,site text,period_key text,payload jsonb
    )
  ),
  prepared as (
    select
      v_org as organization_id,
      coalesce(
        upper(nullif(r.site,'')),upper(nullif(r.payload->'driver'->>'site','')),
        case when cardinality(fm.sites)=1 then upper(fm.sites[1]) end
      ) as site,
      nullif(r.payload->'period'->>'weekLabel','') as week_label,
      d.id as driver_id,r.entity_key as driver_trid,
      coalesce(nullif(btrim(r.payload->'driver'->>'name'),''),r.entity_key) as driver_name,
      greatest(0,trunc(private.smart_import_num(coalesce(r.payload->'driver'->'rawMetrics','{}'::jsonb),'concessions')))::integer as dnr,
      r.source_file_name as source_file
    from records r
    join smart_import_file_map fm on fm.file_name=r.source_file_name
    left join public.drivers d on d.organization_id=v_org and d.trid=r.entity_key
    where r.report_type='DRIVER_PERIOD'
      and r.entity_key ~ '^A[A-Z0-9]{8,}$'
      and coalesce(r.payload->'period'->>'granularity','')='weekly'
      and 'concessions_weekly_snapshots'=any(fm.targets)
      and private.smart_import_num(coalesce(r.payload->'driver'->'rawMetrics','{}'::jsonb),'concessions') is not null
  )
  insert into public.concessions_weekly_snapshots(
    organization_id,site,week_label,driver_id,driver_trid,driver_name,dnr,source_file,updated_at
  )
  select organization_id,site,week_label,driver_id,driver_trid,driver_name,dnr,source_file,v_now
  from prepared
  where site is not null and week_label is not null
  on conflict (organization_id,site,week_label,driver_trid)
  do update set
    driver_id=excluded.driver_id,driver_name=excluded.driver_name,dnr=excluded.dnr,
    source_file=excluded.source_file,updated_at=v_now;

  with records as (
    select *
    from jsonb_to_recordset(coalesce(p_payload->'records','[]'::jsonb)) as r(
      source_file_name text,report_type text,entity_key text,site text,period_key text,payload jsonb
    )
  ),
  resolved as (
    select
      coalesce(
        upper(nullif(r.site,'')),
        upper(nullif(r.payload->'driver'->>'site','')),
        upper(nullif(r.payload->>'site','')),
        case when cardinality(fm.sites)=1 then upper(fm.sites[1]) end
      ) as site,
      r.report_type,
      coalesce(r.payload->'period'->>'granularity','') as granularity,
      r.source_file_name
    from records r
    join smart_import_file_map fm on fm.file_name=r.source_file_name
  ),
  file_sites as (
    select upper(s.site) as site,count(distinct fm.file_name)::integer as files
    from smart_import_file_map fm
    cross join lateral unnest(fm.sites) as s(site)
    where nullif(s.site,'') is not null
    group by upper(s.site)
  ),
  record_counts as (
    select
      site,
      count(*) filter (where report_type='DRIVER_PERIOD' and granularity='weekly')::integer as driver_metrics,
      count(*) filter (where report_type='FEEDBACK_EVENT')::integer as feedback_events,
      count(*) filter (where report_type='SITE_SCORECARD')::integer as scorecards
    from resolved
    where site is not null
    group by site
  ),
  all_sites as (
    select site from file_sites
    union
    select site from record_counts
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'site',s.site,
        'files',coalesce(f.files,0),
        'driverMetrics',coalesce(r.driver_metrics,0),
        'feedbackEvents',coalesce(r.feedback_events,0),
        'scorecards',coalesce(r.scorecards,0),
        'records',coalesce(r.driver_metrics,0)+coalesce(r.feedback_events,0)+coalesce(r.scorecards,0)
      )
      order by s.site
    ),
    '[]'::jsonb
  )
  into v_site_breakdown
  from all_sites s
  left join file_sites f on f.site=s.site
  left join record_counts r on r.site=s.site;

  v_summary := v_preflight || jsonb_build_object(
    'committed',true,'alreadyCommitted',false,'commitId',v_commit_id,
    'stagingBatchId',v_batch_id,'batchFingerprint',v_fingerprint,
    'importIds',to_jsonb(v_import_ids),'committedAt',v_now,'writesToProduction',true,
    'siteBreakdown',coalesce(v_site_breakdown,'[]'::jsonb)
  );

  update private.smart_import_commits
  set status='committed',actor_id=p_actor,import_ids=v_import_ids,summary=v_summary,committed_at=v_now
  where id=v_commit_id;

  insert into public.audit_events(
    organization_id,actor_id,event_type,entity_type,entity_id,action,before_data,after_data,metadata
  )
  values(
    v_org,p_actor,'smart_import_production_commit','smart_import_batch',v_batch_id::text,
    'Smart Import approved batch committed to Production','{}'::jsonb,v_summary,
    jsonb_build_object('batch_fingerprint',v_fingerprint,'commit_id',v_commit_id,'import_ids',to_jsonb(v_import_ids))
  );

  return v_summary;
end
$$;

revoke all on function private.smart_import_num(jsonb,text) from public,anon,authenticated;
revoke all on function private.smart_import_merge_raw(jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.smart_import_performance(numeric,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function private.smart_import_risk(numeric,numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function private.smart_import_issue(numeric,numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function private.smart_import_commit(jsonb,uuid) from public,anon,authenticated;

grant execute on function private.smart_import_num(jsonb,text) to postgres,service_role;
grant execute on function private.smart_import_merge_raw(jsonb,jsonb) to postgres,service_role;
grant execute on function private.smart_import_performance(numeric,numeric,numeric,numeric) to postgres,service_role;
grant execute on function private.smart_import_risk(numeric,numeric,numeric,numeric,numeric,numeric) to postgres,service_role;
grant execute on function private.smart_import_issue(numeric,numeric,numeric,numeric,numeric,numeric) to postgres,service_role;
grant execute on function private.smart_import_commit(jsonb,uuid) to postgres,service_role;

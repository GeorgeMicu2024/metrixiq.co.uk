-- MetrixIQ Staging only.
-- Cross-batch file reuse is provenance, not exclusion.
-- Full-batch replays are handled by stage_payload_v3 fingerprint idempotency.
-- Partial-overlap batches must retain all current normalized evidence.

create or replace function smart_import_lab.stage_payload(
  p_body jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = smart_import_lab, public
as $$
declare
  v_org uuid;
  v_batch uuid;
  v_summary jsonb := coalesce(p_body->'summary', '{}'::jsonb);
  v_total_files integer := 0;
  v_ready_files integer := 0;
  v_blocked_files integer := 0;
  v_duplicate_files integer := 0;
  v_previously_staged_files integer := 0;
  v_records integer := 0;
  v_initial_status text := 'staging';
begin
  if coalesce((p_body->>'writesEnabled')::boolean, true) <> false then
    raise exception 'Staging requires a validated zero-write source plan.';
  end if;

  v_org := (p_body->>'organizationId')::uuid;

  if jsonb_typeof(p_body->'files') <> 'array' or jsonb_array_length(p_body->'files') < 1 then
    raise exception 'No staging files were supplied.';
  end if;
  if jsonb_array_length(p_body->'files') > 400 then
    raise exception 'Too many files in one staging batch.';
  end if;
  if coalesce(jsonb_typeof(p_body->'records'), 'null') <> 'array' then
    raise exception 'Records payload is missing.';
  end if;
  if jsonb_array_length(p_body->'records') > 5000 then
    raise exception 'Too many records in one staging batch.';
  end if;

  if coalesce((v_summary->>'blockedFileCount')::integer, 0) > 0
     or coalesce((v_summary->>'logicalConflictCount')::integer, 0) > 0 then
    v_initial_status := 'review';
  end if;

  insert into smart_import_lab.batches (
    organization_id, created_by, mode, status,
    source_count, unique_file_count, exact_duplicate_count,
    logical_conflict_count, ready_file_count, blocked_file_count,
    parser_version, metadata
  )
  values (
    v_org, p_actor, 'staging', v_initial_status,
    greatest(0, coalesce((v_summary->>'sourceCount')::integer, 0)),
    greatest(0, coalesce((v_summary->>'uniqueFileCount')::integer, 0)),
    greatest(0, coalesce((v_summary->>'exactDuplicateCount')::integer, 0)),
    greatest(0, coalesce((v_summary->>'logicalConflictCount')::integer, 0)),
    greatest(0, coalesce((v_summary->>'readyFileCount')::integer, 0)),
    greatest(0, coalesce((v_summary->>'blockedFileCount')::integer, 0)),
    coalesce(nullif(p_body->>'parserVersion',''), 'smart-import-v1'),
    jsonb_build_object(
      'sourceRows', greatest(0, coalesce((v_summary->>'sourceRows')::integer, 0)),
      'feedbackRows', greatest(0, coalesce((v_summary->>'feedbackRows')::integer, 0)),
      'scorecardRows', greatest(0, coalesce((v_summary->>'scorecardRows')::integer, 0)),
      'destinations', coalesce(v_summary->'destinations', '{}'::jsonb),
      'source', 'metrixiq-smart-import-lab'
    )
  )
  returning id into v_batch;

  insert into smart_import_lab.files (
    batch_id, organization_id, file_name, content_hash, byte_size, mime_type,
    report_types, sites, period_key, granularity, confidence, state, row_count,
    targets, warnings, detection_evidence, metadata
  )
  select
    v_batch, v_org, x."fileName", lower(x."contentHash"),
    greatest(0, coalesce(x."byteSize", 0)), x."mimeType",
    coalesce(x."reportTypes", '{}'::text[]), coalesce(x.sites, '{}'::text[]),
    x."periodKey", x.granularity,
    greatest(0, least(100, coalesce(x.confidence, 0))), x.state,
    greatest(0, coalesce(x."rowCount", 0)),
    coalesce(x.targets, '{}'::text[]), coalesce(x.warnings, '[]'::jsonb),
    coalesce(x."detectionEvidence", '{}'::jsonb), coalesce(x.metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_body->'files') as x(
    "fileName" text, "contentHash" text, "byteSize" bigint, "mimeType" text,
    "reportTypes" text[], sites text[], "periodKey" text, granularity text,
    confidence numeric, state text, "rowCount" integer, targets text[],
    warnings jsonb, "detectionEvidence" jsonb, metadata jsonb
  )
  where x."fileName" is not null
    and x."contentHash" ~ '^[a-fA-F0-9]{64}$'
    and x.state in ('ready','warning','blocked','duplicate','failed');

  if not found then
    raise exception 'No valid staging files were accepted.';
  end if;

  -- Exact duplicates inside this upload remain excluded.
  update smart_import_lab.files f
  set exact_duplicate_of_file_id = original.id
  from smart_import_lab.files original
  where f.batch_id = v_batch
    and f.state = 'duplicate'
    and original.batch_id = f.batch_id
    and original.file_name = f.metadata->>'duplicateOfName'
    and original.id <> f.id;

  -- A file used by an earlier successful staging batch stays READY in the
  -- current batch. We only record provenance so the batch remains coherent.
  with previous_matches as (
    select
      current_file.id as current_id,
      previous.id as previous_id,
      previous.batch_id as previous_batch_id
    from smart_import_lab.files current_file
    cross join lateral (
      select p.id, p.batch_id
      from smart_import_lab.files p
      join smart_import_lab.batches pb on pb.id = p.batch_id
      where p.organization_id = current_file.organization_id
        and p.content_hash = current_file.content_hash
        and p.batch_id <> current_file.batch_id
        and p.state <> 'failed'
        and pb.status not in ('failed','discarded')
      order by p.created_at desc
      limit 1
    ) previous
    where current_file.batch_id = v_batch
      and current_file.state in ('ready','warning')
  )
  update smart_import_lab.files f
  set
    exact_duplicate_of_file_id = m.previous_id,
    metadata = coalesce(f.metadata, '{}'::jsonb) || jsonb_build_object(
      'previouslyStaged', true,
      'previousBatchId', m.previous_batch_id,
      'previousFileId', m.previous_id
    )
  from previous_matches m
  where f.id = m.current_id;

  insert into smart_import_lab.records (
    batch_id, file_id, organization_id, site, report_type, period_key,
    record_key, entity_level, entity_key, metric_key, metric_value, metric_text,
    payload, source_priority
  )
  select
    v_batch, f.id, v_org, upper(nullif(r.site,'')), r."reportType",
    nullif(r."periodKey",''), r."recordKey", nullif(r."entityLevel",''),
    nullif(r."entityKey",''), nullif(r."metricKey",''),
    r."metricValue", r."metricText", coalesce(r.payload, '{}'::jsonb),
    greatest(0, least(100, coalesce(r."sourcePriority", 50)))
  from jsonb_to_recordset(p_body->'records') as r(
    "sourceFileName" text, site text, "reportType" text, "periodKey" text,
    "recordKey" text, "entityLevel" text, "entityKey" text, "metricKey" text,
    "metricValue" numeric, "metricText" text, payload jsonb, "sourcePriority" smallint
  )
  join smart_import_lab.files f
    on f.batch_id = v_batch
   and f.file_name = r."sourceFileName"
   and f.state in ('ready','warning')
  where r."recordKey" is not null
    and r."reportType" is not null
  on conflict (batch_id, record_key) do update
    set payload = smart_import_lab.records.payload || excluded.payload,
        source_priority = greatest(
          smart_import_lab.records.source_priority,
          excluded.source_priority
        );

  insert into smart_import_lab.conflicts (
    batch_id, file_id, organization_id, conflict_type, severity, fingerprint, details
  )
  select
    v_batch, f.id, v_org, coalesce(warning->>'code', 'BLOCKED_FILE'),
    'blocking', f.content_hash, warning
  from smart_import_lab.files f
  cross join lateral jsonb_array_elements(f.warnings) warning
  where f.batch_id = v_batch
    and f.state = 'blocked';

  insert into smart_import_lab.conflicts (
    batch_id, file_id, organization_id, conflict_type, severity, fingerprint, details
  )
  select
    v_batch, f.id, v_org, 'BLOCKED_FILE', 'blocking', f.content_hash,
    jsonb_build_object('message','File was blocked before staging.')
  from smart_import_lab.files f
  where f.batch_id = v_batch
    and f.state = 'blocked'
    and jsonb_array_length(f.warnings) = 0;

  select count(*)::int
  into v_previously_staged_files
  from smart_import_lab.files
  where batch_id = v_batch
    and state in ('ready','warning')
    and coalesce((metadata->>'previouslyStaged')::boolean, false);

  insert into smart_import_lab.audit_events (
    batch_id, organization_id, actor_id, event_type, details
  )
  values (
    v_batch, v_org, p_actor, 'STAGED',
    jsonb_build_object(
      'sites',
      coalesce((
        select jsonb_agg(distinct site)
        from smart_import_lab.files f
        cross join lateral unnest(f.sites) site
        where f.batch_id = v_batch
      ), '[]'::jsonb),
      'parserVersion', coalesce(nullif(p_body->>'parserVersion',''), 'smart-import-v1'),
      'previouslyStagedFiles', v_previously_staged_files
    )
  );

  select
    count(*)::int,
    count(*) filter (where state in ('ready','warning'))::int,
    count(*) filter (where state='blocked')::int,
    count(*) filter (where state='duplicate')::int
  into v_total_files, v_ready_files, v_blocked_files, v_duplicate_files
  from smart_import_lab.files
  where batch_id = v_batch;

  select count(*)::int
  into v_records
  from smart_import_lab.records
  where batch_id = v_batch;

  update smart_import_lab.batches
  set
    ready_file_count = v_ready_files,
    blocked_file_count = v_blocked_files,
    exact_duplicate_count = v_duplicate_files,
    status = case when v_blocked_files > 0 then 'review' else 'staging' end,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('previouslyStagedFiles', v_previously_staged_files),
    updated_at = now()
  where id = v_batch;

  return jsonb_build_object(
    'batchId', v_batch,
    'totalFiles', v_total_files,
    'readyFiles', v_ready_files,
    'blockedFiles', v_blocked_files,
    'duplicateFiles', v_duplicate_files,
    'previouslyStagedFiles', v_previously_staged_files,
    'records', v_records
  );
end;
$$;

revoke all on function smart_import_lab.stage_payload(jsonb, uuid) from public, anon, authenticated;
grant execute on function smart_import_lab.stage_payload(jsonb, uuid) to postgres, service_role;

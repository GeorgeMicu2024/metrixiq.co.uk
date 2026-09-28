-- MetrixIQ Staging only.
-- Make Smart Import staging idempotent for repeated clicks/retries.

alter table smart_import_lab.batches
  add column if not exists batch_fingerprint text;

create or replace function smart_import_lab.payload_fingerprint(p_body jsonb)
returns text
language sql
immutable
set search_path = smart_import_lab, public
as $$
  select md5(
    coalesce(p_body->>'organizationId','') || '|' ||
    coalesce(p_body->>'parserVersion','smart-import-v1') || '|' ||
    coalesce(p_body->'summary'->>'sourceRows','0') || '|' ||
    coalesce(p_body->'summary'->>'feedbackRows','0') || '|' ||
    coalesce(p_body->'summary'->>'scorecardRows','0') || '|' ||
    coalesce((
      select string_agg(
        lower(coalesce(f->>'contentHash','')) || ':' ||
        coalesce((
          select string_agg(value, ',' order by value)
          from jsonb_array_elements_text(coalesce(f->'reportTypes','[]'::jsonb))
        ),'') || ':' ||
        coalesce((
          select string_agg(value, ',' order by value)
          from jsonb_array_elements_text(coalesce(f->'sites','[]'::jsonb))
        ),'') || ':' ||
        coalesce(f->>'periodKey','') || ':' ||
        coalesce(f->>'granularity','') || ':' ||
        coalesce(f->>'state',''),
        '|' order by
          lower(coalesce(f->>'contentHash','')),
          coalesce(f->>'periodKey',''),
          coalesce(f->>'state','')
      )
      from jsonb_array_elements(coalesce(p_body->'files','[]'::jsonb)) f
    ),'')
  );
$$;

revoke all on function smart_import_lab.payload_fingerprint(jsonb) from public, anon, authenticated;
grant execute on function smart_import_lab.payload_fingerprint(jsonb) to postgres, service_role;

create unique index if not exists smart_import_batches_active_fingerprint_uidx
  on smart_import_lab.batches (organization_id, batch_fingerprint)
  where batch_fingerprint is not null
    and status not in ('failed','discarded');

create or replace function smart_import_lab.stage_payload_v3(
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
  v_fp text;
  v_existing uuid;
  v_result jsonb;
  v_ready integer := 0;
  v_blocked integer := 0;
  v_duplicates integer := 0;
  v_records integer := 0;
  v_driver integer := 0;
  v_feedback integer := 0;
  v_scorecards integer := 0;
begin
  v_org := (p_body->>'organizationId')::uuid;
  v_fp := smart_import_lab.payload_fingerprint(p_body);

  perform pg_advisory_xact_lock(hashtext(v_org::text), hashtext(v_fp));

  select id
  into v_existing
  from smart_import_lab.batches
  where organization_id = v_org
    and batch_fingerprint = v_fp
    and status in ('staging','approved','committed')
    and metadata->>'reconciliationStatus' = 'passed'
  order by created_at desc
  limit 1;

  if v_existing is not null then
    select
      count(*) filter (where state in ('ready','warning'))::int,
      count(*) filter (where state='blocked')::int,
      count(*) filter (where state='duplicate')::int
    into v_ready, v_blocked, v_duplicates
    from smart_import_lab.files
    where batch_id = v_existing;

    select
      count(*)::int,
      count(*) filter (where report_type='DRIVER_PERIOD')::int,
      count(*) filter (where report_type='FEEDBACK_EVENT')::int,
      count(*) filter (where report_type='SITE_SCORECARD')::int
    into v_records, v_driver, v_feedback, v_scorecards
    from smart_import_lab.records
    where batch_id = v_existing;

    return jsonb_build_object(
      'batchId', v_existing,
      'readyFiles', v_ready,
      'blockedFiles', v_blocked,
      'duplicateFiles', v_duplicates,
      'records', v_records,
      'reconciled', true,
      'driverRecords', v_driver,
      'feedbackRecords', v_feedback,
      'scorecardRecords', v_scorecards,
      'alreadyStaged', true,
      'batchFingerprint', v_fp
    );
  end if;

  v_result := smart_import_lab.stage_payload_v2(p_body, p_actor);

  update smart_import_lab.batches
  set
    batch_fingerprint = v_fp,
    metadata = coalesce(metadata,'{}'::jsonb)
      || jsonb_build_object('batchFingerprint', v_fp),
    updated_at = now()
  where id = (v_result->>'batchId')::uuid;

  return v_result || jsonb_build_object(
    'alreadyStaged', false,
    'batchFingerprint', v_fp
  );
end;
$$;

revoke all on function smart_import_lab.stage_payload_v3(jsonb, uuid) from public, anon, authenticated;
grant execute on function smart_import_lab.stage_payload_v3(jsonb, uuid) to postgres, service_role;

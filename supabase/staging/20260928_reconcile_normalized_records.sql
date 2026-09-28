-- MetrixIQ Staging only.
-- Reconcile normalized payload records against normalized stored records.
-- Raw parser-row counters remain audit metadata and are not used as DB equality targets.

create or replace function smart_import_lab.stage_payload_v2(
  p_body jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = smart_import_lab, public
as $$
declare
  v_result jsonb;
  v_batch uuid;

  v_raw_driver integer := 0;
  v_raw_feedback integer := 0;
  v_raw_scorecards integer := 0;

  v_expected_driver integer := 0;
  v_expected_feedback integer := 0;
  v_expected_scorecards integer := 0;

  v_driver integer := 0;
  v_feedback integer := 0;
  v_scorecards integer := 0;
begin
  v_raw_driver := greatest(0, coalesce((p_body->'summary'->>'sourceRows')::integer, 0));
  v_raw_feedback := greatest(0, coalesce((p_body->'summary'->>'feedbackRows')::integer, 0));
  v_raw_scorecards := greatest(0, coalesce((p_body->'summary'->>'scorecardRows')::integer, 0));

  select
    count(*) filter (where r."reportType"='DRIVER_PERIOD')::int,
    count(*) filter (where r."reportType"='FEEDBACK_EVENT')::int,
    count(*) filter (where r."reportType"='SITE_SCORECARD')::int
  into v_expected_driver, v_expected_feedback, v_expected_scorecards
  from jsonb_to_recordset(coalesce(p_body->'records','[]'::jsonb)) as r(
    "reportType" text
  );

  v_result := smart_import_lab.stage_payload(p_body, p_actor);
  v_batch := (v_result->>'batchId')::uuid;

  select
    count(*) filter (where report_type='DRIVER_PERIOD')::int,
    count(*) filter (where report_type='FEEDBACK_EVENT')::int,
    count(*) filter (where report_type='SITE_SCORECARD')::int
  into v_driver, v_feedback, v_scorecards
  from smart_import_lab.records
  where batch_id = v_batch;

  if v_driver <> v_expected_driver
     or v_feedback <> v_expected_feedback
     or v_scorecards <> v_expected_scorecards then
    raise exception
      'Staging reconciliation failed. Expected normalized driver/feedback/scorecard %/%/%, stored %/%/%',
      v_expected_driver, v_expected_feedback, v_expected_scorecards,
      v_driver, v_feedback, v_scorecards;
  end if;

  update smart_import_lab.batches
  set
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'reconciliationStatus','passed',
      'rawDriverRows',v_raw_driver,
      'rawFeedbackRows',v_raw_feedback,
      'rawScorecardRows',v_raw_scorecards,
      'normalizedDriverRecords',v_expected_driver,
      'normalizedFeedbackRecords',v_expected_feedback,
      'normalizedScorecardRecords',v_expected_scorecards,
      'driverRecords',v_driver,
      'feedbackRecords',v_feedback,
      'scorecardRecords',v_scorecards
    ),
    updated_at = now()
  where id = v_batch;

  insert into smart_import_lab.audit_events (
    batch_id, organization_id, actor_id, event_type, details
  )
  select
    v_batch,
    organization_id,
    p_actor,
    'RECONCILIATION_PASSED',
    jsonb_build_object(
      'rawDriverRows',v_raw_driver,
      'rawFeedbackRows',v_raw_feedback,
      'rawScorecardRows',v_raw_scorecards,
      'normalizedDriverRecords',v_expected_driver,
      'normalizedFeedbackRecords',v_expected_feedback,
      'normalizedScorecardRecords',v_expected_scorecards,
      'driverRecords',v_driver,
      'feedbackRecords',v_feedback,
      'scorecardRecords',v_scorecards
    )
  from smart_import_lab.batches
  where id = v_batch;

  return v_result || jsonb_build_object(
    'reconciled', true,
    'rawDriverRows', v_raw_driver,
    'rawFeedbackRows', v_raw_feedback,
    'rawScorecardRows', v_raw_scorecards,
    'normalizedDriverRecords', v_expected_driver,
    'normalizedFeedbackRecords', v_expected_feedback,
    'normalizedScorecardRecords', v_expected_scorecards,
    'driverRecords', v_driver,
    'feedbackRecords', v_feedback,
    'scorecardRecords', v_scorecards
  );
end;
$$;

revoke all on function smart_import_lab.stage_payload_v2(jsonb, uuid) from public, anon, authenticated;
grant execute on function smart_import_lab.stage_payload_v2(jsonb, uuid) to postgres, service_role;

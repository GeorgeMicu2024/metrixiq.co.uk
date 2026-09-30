-- MetrixIQ Staging only.
-- Approval must reject driver-period evidence that cannot map to a Production driver TRID.

create or replace function smart_import_lab.approve_batch(
  p_batch_id uuid,
  p_organization_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = smart_import_lab, public
as $$
declare
  v_batch smart_import_lab.batches%rowtype;
  v_driver integer := 0;
  v_feedback integer := 0;
  v_scorecards integer := 0;
  v_files integer := 0;
  v_conflicts integer := 0;
  v_invalid_driver_identities integer := 0;
begin
  select *
  into v_batch
  from smart_import_lab.batches
  where id = p_batch_id
    and organization_id = p_organization_id
  for update;

  if not found then raise exception 'Batch not found for this workspace.'; end if;

  select count(*)::int
  into v_invalid_driver_identities
  from smart_import_lab.records
  where batch_id = p_batch_id
    and report_type='DRIVER_PERIOD'
    and (entity_key is null or entity_key !~ '^A[A-Z0-9]{8,}$');

  if v_invalid_driver_identities <> 0 then
    raise exception 'Batch contains invalid driver identities and must be reanalysed.';
  end if;

  if v_batch.status = 'approved' then
    select
      count(*) filter (where report_type='DRIVER_PERIOD')::int,
      count(*) filter (where report_type='FEEDBACK_EVENT')::int,
      count(*) filter (where report_type='SITE_SCORECARD')::int
    into v_driver, v_feedback, v_scorecards
    from smart_import_lab.records
    where batch_id = p_batch_id;

    return jsonb_build_object(
      'batchId', p_batch_id,
      'status', 'approved',
      'alreadyApproved', true,
      'approvedAt', v_batch.approved_at,
      'driverRecords', v_driver,
      'feedbackRecords', v_feedback,
      'scorecardRecords', v_scorecards,
      'writesToProduction', false
    );
  end if;

  if v_batch.status <> 'staging' then
    raise exception 'Only reconciled staging batches can be approved.';
  end if;
  if coalesce(v_batch.metadata->>'reconciliationStatus','') <> 'passed' then
    raise exception 'Batch reconciliation has not passed.';
  end if;
  if v_batch.blocked_file_count <> 0 or v_batch.logical_conflict_count <> 0 then
    raise exception 'Batch still contains blocked files or logical conflicts.';
  end if;
  if v_batch.batch_fingerprint is null or length(v_batch.batch_fingerprint) < 16 then
    raise exception 'Batch fingerprint is missing.';
  end if;

  select count(*)::int into v_files
  from smart_import_lab.files
  where batch_id = p_batch_id and state in ('ready','warning');

  if v_files <> v_batch.ready_file_count then
    raise exception 'Ready file count changed after staging.';
  end if;

  select count(*)::int into v_conflicts
  from smart_import_lab.conflicts
  where batch_id = p_batch_id and severity='blocking';

  if v_conflicts <> 0 then
    raise exception 'Blocking conflicts were found after staging.';
  end if;

  select
    count(*) filter (where report_type='DRIVER_PERIOD')::int,
    count(*) filter (where report_type='FEEDBACK_EVENT')::int,
    count(*) filter (where report_type='SITE_SCORECARD')::int
  into v_driver, v_feedback, v_scorecards
  from smart_import_lab.records
  where batch_id = p_batch_id;

  if v_driver <> coalesce((v_batch.metadata->>'normalizedDriverRecords')::integer, v_driver)
     or v_feedback <> coalesce((v_batch.metadata->>'normalizedFeedbackRecords')::integer, v_feedback)
     or v_scorecards <> coalesce((v_batch.metadata->>'normalizedScorecardRecords')::integer, v_scorecards) then
    raise exception 'Stored evidence changed after reconciliation.';
  end if;

  update smart_import_lab.batches
  set status='approved',
      mode='approved',
      approved_by=p_actor,
      approved_at=coalesce(approved_at,now()),
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'approvalStatus','passed',
        'approvedRecordCount',v_driver+v_feedback+v_scorecards,
        'invalidDriverIdentities',0
      )
  where id=p_batch_id
  returning * into v_batch;

  insert into smart_import_lab.audit_events(
    batch_id,organization_id,actor_id,event_type,details
  )
  values(
    p_batch_id,p_organization_id,p_actor,'APPROVED',
    jsonb_build_object(
      'driverRecords',v_driver,
      'feedbackRecords',v_feedback,
      'scorecardRecords',v_scorecards,
      'invalidDriverIdentities',0,
      'writesToProduction',false
    )
  );

  return jsonb_build_object(
    'batchId',p_batch_id,
    'status','approved',
    'alreadyApproved',false,
    'approvedAt',v_batch.approved_at,
    'driverRecords',v_driver,
    'feedbackRecords',v_feedback,
    'scorecardRecords',v_scorecards,
    'writesToProduction',false
  );
end;
$$;

revoke all on function smart_import_lab.approve_batch(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function smart_import_lab.approve_batch(uuid,uuid,uuid) to postgres, service_role;

-- MetrixIQ Staging only.
-- Failed/discarded batches must never participate in cross-batch deduplication.
-- stage_payload() already ignores file rows whose state = 'failed'; this trigger
-- guarantees terminal batches transition their child file rows to that state.

create or replace function smart_import_lab.sync_terminal_batch_file_states()
returns trigger
language plpgsql
security invoker
set search_path = smart_import_lab, public
as $$
begin
  if new.status in ('failed','discarded')
     and new.status is distinct from old.status then
    update smart_import_lab.files
    set
      metadata = coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object('stateBeforeBatchTerminal', state),
      state = 'failed',
      targets = '{}'::text[]
    where batch_id = new.id
      and state <> 'failed';
  end if;
  return new;
end;
$$;

drop trigger if exists smart_import_batch_terminal_files on smart_import_lab.batches;
create trigger smart_import_batch_terminal_files
after update of status on smart_import_lab.batches
for each row
execute function smart_import_lab.sync_terminal_batch_file_states();

revoke all on function smart_import_lab.sync_terminal_batch_file_states() from public, anon, authenticated;
grant execute on function smart_import_lab.sync_terminal_batch_file_states() to postgres, service_role;

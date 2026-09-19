alter table public.mentor_daily_snapshots
  add column if not exists source_identity_key text;

update public.mentor_daily_snapshots
set source_identity_key = coalesce(
  nullif(raw_data #>> '{mentor,identityKey}', ''),
  driver_id::text
)
where source_identity_key is null;

alter table public.mentor_daily_snapshots
  alter column source_identity_key set not null;

alter table public.mentor_daily_snapshots
  drop constraint if exists mentor_daily_org_driver_date_unique;

drop index if exists public.mentor_daily_org_driver_date_unique;

create unique index if not exists mentor_daily_org_date_source_unique
  on public.mentor_daily_snapshots (organization_id, report_date, source_identity_key);

create index if not exists mentor_daily_driver_date_source_idx
  on public.mentor_daily_snapshots (driver_id, report_date desc, source_identity_key);

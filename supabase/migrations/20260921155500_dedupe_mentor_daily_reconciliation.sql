alter table public.unmatched_driver_records
  add column if not exists reconciliation_key text;

update public.unmatched_driver_records
set reconciliation_key = coalesce(
  nullif(payload->'driver'->>'mentorHash',''),
  nullif(payload->'driver'->'details'->'mentor'->>'identityKey',''),
  nullif(raw_trid,''),
  nullif(normalized_name,'')
)
where report_type='mentor_daily' and reconciliation_key is null;

with ranked as (
  select id,
         row_number() over (
           partition by organization_id, report_type, (payload->>'reportDate'), reconciliation_key
           order by
             case status when 'resolved' then 4 when 'hidden' then 3 when 'transporter' then 2 else 1 end desc,
             created_at desc
         ) as rn
  from public.unmatched_driver_records
  where report_type='mentor_daily'
    and reconciliation_key is not null
    and nullif(payload->>'reportDate','') is not null
)
delete from public.unmatched_driver_records u
using ranked r
where u.id=r.id and r.rn>1;

create unique index if not exists unmatched_mentor_daily_identity_unique
on public.unmatched_driver_records (
  organization_id,
  report_type,
  (payload->>'reportDate'),
  reconciliation_key
)
where report_type='mentor_daily'
  and reconciliation_key is not null
  and nullif(payload->>'reportDate','') is not null;
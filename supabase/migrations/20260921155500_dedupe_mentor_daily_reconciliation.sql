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

-- 2026-09-24: harden current driver scorecard snapshot selection.
-- Keep daily/cross-site evidence in history, but never let it become the primary scorecard.
create or replace view public.driver_scorecards as
select d.id as driver_id,d.organization_id,d.trid,d.full_name,d.site,d.status,m.period_start,m.period_end,m.week_label,m.performance,m.dcr,m.pod,m.iadc,m.cc,m.fico,m.ementor,m.mentor_score,m.psb,m.reattempts,m.concessions,m.lor,m.delivered,m.dnr_dpmo,m.dsc_dpmo,m.ce_dpmo,m.cdf_dpmo,m.scorecard_score,m.tier,m.risk,m.issue,m.data_confidence,m.raw_data,m.created_at as metrics_created_at
from public.drivers d
left join lateral (
 select dm.* from public.driver_metrics dm
 where dm.driver_id=d.id and dm.organization_id=d.organization_id
   and coalesce(dm.raw_data->>'metric_granularity','weekly')<>'daily'
 order by
   case when d.site is not null and upper(btrim(dm.site))=upper(btrim(d.site)) then 0 when dm.site is null then 1 else 2 end,
   dm.period_end desc nulls last,
   ((dm.performance is not null)::int+(dm.dcr is not null)::int+(dm.pod is not null)::int+(dm.iadc is not null)::int+(dm.cc is not null)::int+(coalesce(dm.mentor_score,dm.ementor,dm.fico) is not null)::int+(dm.psb is not null)::int+(dm.reattempts is not null)::int+(dm.concessions is not null)::int+(dm.lor is not null)::int) desc,
   dm.created_at desc
 limit 1
) m on true;

-- Backfill driver site from trusted metric source filenames.
-- Applied to production Supabase on 2026-09-18.
--
-- Safety:
-- - only blank driver.site values are touched
-- - a site must be inferable from stored source_files
-- - all inferred source sites for the driver must agree

with source_sites as (
  select
    dm.driver_id,
    upper((regexp_match(
      source_file,
      '(^|[^A-Z0-9])(D[A-Z]{1,4}[0-9]{1,3})([^A-Z0-9]|$)',
      'i'
    ))[2]) as site
  from public.driver_metrics dm
  cross join lateral jsonb_array_elements_text(
    coalesce(dm.raw_data->'source_files','[]'::jsonb)
  ) as source_file
  where dm.driver_id is not null
),
resolved as (
  select
    driver_id,
    min(site) as site
  from source_sites
  where site is not null
  group by driver_id
  having count(distinct site)=1
)
update public.drivers d
set
  site = r.site,
  updated_at = now()
from resolved r
where d.id = r.driver_id
  and (d.site is null or btrim(d.site)='');

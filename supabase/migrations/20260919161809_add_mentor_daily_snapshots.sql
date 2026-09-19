create table public.mentor_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  source_import_id uuid references public.imports(id) on delete set null,
  report_date date not null,
  week_label text not null,
  mentor_score numeric,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint mentor_daily_score_range check (
    mentor_score is null or (mentor_score >= 0 and mentor_score <= 1000)
  ),
  constraint mentor_daily_org_driver_date_unique unique (organization_id, driver_id, report_date)
);

create index mentor_daily_org_date_idx
  on public.mentor_daily_snapshots (organization_id, report_date desc);

create index mentor_daily_driver_date_idx
  on public.mentor_daily_snapshots (driver_id, report_date desc);

create index mentor_daily_source_import_idx
  on public.mentor_daily_snapshots (source_import_id);

alter table public.mentor_daily_snapshots enable row level security;

grant select, insert, update, delete on public.mentor_daily_snapshots to authenticated;
revoke all on public.mentor_daily_snapshots from anon;

create policy mentor_daily_select_members
  on public.mentor_daily_snapshots
  for select
  to authenticated
  using (private.can_access_driver(organization_id, driver_id));

create policy mentor_daily_insert_ops
  on public.mentor_daily_snapshots
  for insert
  to authenticated
  with check (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_driver(organization_id, driver_id)
  );

create policy mentor_daily_update_ops
  on public.mentor_daily_snapshots
  for update
  to authenticated
  using (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_driver(organization_id, driver_id)
  )
  with check (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_driver(organization_id, driver_id)
  );

create policy mentor_daily_delete_admin
  on public.mentor_daily_snapshots
  for delete
  to authenticated
  using (private.has_org_role(organization_id, array['owner','admin']));

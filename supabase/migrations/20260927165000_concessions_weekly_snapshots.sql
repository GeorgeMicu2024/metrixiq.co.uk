create table if not exists public.concessions_weekly_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site text not null,
  week_label text not null,
  driver_id uuid references public.drivers(id) on delete set null,
  driver_trid text not null,
  driver_name text not null,
  dnr integer not null default 0,
  source_file text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concessions_weekly_week_check check (week_label ~ '^W[0-9]{2}$'),
  constraint concessions_weekly_dnr_check check (dnr >= 0),
  constraint concessions_weekly_unique unique (organization_id, site, week_label, driver_trid)
);

create index if not exists concessions_weekly_org_site_week_idx
  on public.concessions_weekly_snapshots (organization_id, site, week_label desc);

create index if not exists concessions_weekly_driver_idx
  on public.concessions_weekly_snapshots (organization_id, driver_trid);

alter table public.concessions_weekly_snapshots enable row level security;

grant select, insert, update, delete on public.concessions_weekly_snapshots to authenticated;
revoke all on public.concessions_weekly_snapshots from anon;

drop policy if exists concessions_weekly_select_members on public.concessions_weekly_snapshots;
create policy concessions_weekly_select_members
  on public.concessions_weekly_snapshots
  for select
  to authenticated
  using (private.can_access_site(organization_id, site));

drop policy if exists concessions_weekly_insert_ops on public.concessions_weekly_snapshots;
create policy concessions_weekly_insert_ops
  on public.concessions_weekly_snapshots
  for insert
  to authenticated
  with check (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_site(organization_id, site)
  );

drop policy if exists concessions_weekly_update_ops on public.concessions_weekly_snapshots;
create policy concessions_weekly_update_ops
  on public.concessions_weekly_snapshots
  for update
  to authenticated
  using (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_site(organization_id, site)
  )
  with check (
    private.has_org_role(organization_id, array['owner','admin','manager'])
    and private.can_access_site(organization_id, site)
  );

drop policy if exists concessions_weekly_delete_admin on public.concessions_weekly_snapshots;
create policy concessions_weekly_delete_admin
  on public.concessions_weekly_snapshots
  for delete
  to authenticated
  using (private.has_org_role(organization_id, array['owner','admin']));

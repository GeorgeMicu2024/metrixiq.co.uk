-- Additive CHECK LOR records. Raw Amazon/Packages files never stored.
create table if not exists public.lor_investigations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site text not null,
  tracking_id text not null,
  transporter_id text,
  driver_name text not null,
  route_code text,
  risk_scan_at text,
  amazon_status text,
  route_status text,
  route_rts_at text,
  verdict text not null default 'investigation',
  manager_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lor_investigations_unique unique (organization_id, tracking_id),
  constraint lor_investigations_verdict_check check (verdict in ('investigation','station-check','confirmed-return','confirmed-loss'))
);
create index if not exists lor_investigations_driver_idx on public.lor_investigations (organization_id, transporter_id, updated_at desc);
create index if not exists lor_investigations_site_idx on public.lor_investigations (organization_id, site, updated_at desc);
alter table public.lor_investigations enable row level security;
revoke all on public.lor_investigations from anon;
grant select, insert, update on public.lor_investigations to authenticated;
create policy lor_investigations_select on public.lor_investigations for select to authenticated
  using (private.can_access_site(organization_id, site));
create policy lor_investigations_insert on public.lor_investigations for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner','admin','manager']) and private.can_access_site(organization_id, site));
create policy lor_investigations_update on public.lor_investigations for update to authenticated
  using (private.has_org_role(organization_id, array['owner','admin','manager']) and private.can_access_site(organization_id, site))
  with check (private.has_org_role(organization_id, array['owner','admin','manager']) and private.can_access_site(organization_id, site));

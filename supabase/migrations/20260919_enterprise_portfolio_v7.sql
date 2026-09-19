-- MetrixIQ Enterprise Portfolio V7
-- Multi-organisation portfolios, organisation hierarchy, KPI policies and white-label branding.

create table if not exists public.enterprise_portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enterprise_portfolio_members (
  portfolio_id uuid not null references public.enterprise_portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','viewer')),
  created_at timestamptz not null default now(),
  primary key (portfolio_id,user_id)
);

create table if not exists public.enterprise_portfolio_organizations (
  portfolio_id uuid not null references public.enterprise_portfolios(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text null,
  region text null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (portfolio_id,organization_id)
);

create table if not exists public.organization_site_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site text not null,
  display_name text null,
  region text null,
  country text null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,site)
);

create table if not exists public.organization_kpi_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site text null,
  metric text not null,
  target numeric not null,
  direction text not null default 'gte' check (direction in ('gte','lte')),
  warning_margin numeric not null default 0,
  unit text not null default 'percent' check (unit in ('percent','score','dpmo','count')),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists organization_kpi_policy_scope_unique
  on public.organization_kpi_policies(organization_id,coalesce(site,'*'),metric);

create table if not exists public.organization_branding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  brand_name text null,
  accent_color text not null default '#66E3CE',
  secondary_color text not null default '#9B90FF',
  logo_url text null,
  footer_text text null,
  show_metrixiq_brand boolean not null default true,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enterprise_portfolio_members_user_idx
  on public.enterprise_portfolio_members(user_id,portfolio_id);
create index if not exists enterprise_portfolio_orgs_org_idx
  on public.enterprise_portfolio_organizations(organization_id,portfolio_id);
create index if not exists organization_site_profiles_org_idx
  on public.organization_site_profiles(organization_id,site);
create index if not exists organization_kpi_policies_org_idx
  on public.organization_kpi_policies(organization_id,site,metric);

alter table public.enterprise_portfolios enable row level security;
alter table public.enterprise_portfolio_members enable row level security;
alter table public.enterprise_portfolio_organizations enable row level security;
alter table public.organization_site_profiles enable row level security;
alter table public.organization_kpi_policies enable row level security;
alter table public.organization_branding enable row level security;

revoke insert,update,delete on public.enterprise_portfolios from authenticated;
revoke insert,update,delete on public.enterprise_portfolio_members from authenticated;
revoke insert,update,delete on public.enterprise_portfolio_organizations from authenticated;
revoke insert,update,delete on public.organization_site_profiles from authenticated;
revoke insert,update,delete on public.organization_kpi_policies from authenticated;
revoke insert,update,delete on public.organization_branding from authenticated;

grant select on public.enterprise_portfolios to authenticated;
grant select on public.enterprise_portfolio_members to authenticated;
grant select on public.enterprise_portfolio_organizations to authenticated;
grant select on public.organization_site_profiles to authenticated;
grant select on public.organization_kpi_policies to authenticated;
grant select on public.organization_branding to authenticated;

create or replace function private.can_view_portfolio(p_portfolio_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select private.is_platform_privileged()
    or exists (
      select 1
      from public.enterprise_portfolio_members m
      where m.portfolio_id=p_portfolio_id
        and m.user_id=(select auth.uid())
    );
$$;

create or replace function private.can_manage_portfolio(p_portfolio_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select private.is_platform_privileged()
    or exists (
      select 1
      from public.enterprise_portfolio_members m
      where m.portfolio_id=p_portfolio_id
        and m.user_id=(select auth.uid())
        and m.role in ('owner','admin')
    );
$$;

create or replace function private.can_manage_organization_enterprise(p_organization_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select private.is_platform_privileged()
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id=p_organization_id
        and m.user_id=(select auth.uid())
        and m.role in ('owner','admin','manager')
    );
$$;

drop policy if exists enterprise_portfolios_select on public.enterprise_portfolios;
create policy enterprise_portfolios_select on public.enterprise_portfolios
for select to authenticated using (private.can_view_portfolio(id));

drop policy if exists enterprise_portfolio_members_select on public.enterprise_portfolio_members;
create policy enterprise_portfolio_members_select on public.enterprise_portfolio_members
for select to authenticated using (private.can_view_portfolio(portfolio_id));

drop policy if exists enterprise_portfolio_organizations_select on public.enterprise_portfolio_organizations;
create policy enterprise_portfolio_organizations_select on public.enterprise_portfolio_organizations
for select to authenticated using (private.can_view_portfolio(portfolio_id));

drop policy if exists organization_site_profiles_select on public.organization_site_profiles;
create policy organization_site_profiles_select on public.organization_site_profiles
for select to authenticated using (
  private.has_workspace_permission(organization_id,'view_portfolio')
  or private.is_platform_privileged()
);

drop policy if exists organization_kpi_policies_select on public.organization_kpi_policies;
create policy organization_kpi_policies_select on public.organization_kpi_policies
for select to authenticated using (
  private.has_workspace_permission(organization_id,'view_portfolio')
  or private.has_workspace_permission(organization_id,'view_dashboard')
  or private.is_platform_privileged()
);

drop policy if exists organization_branding_select on public.organization_branding;
create policy organization_branding_select on public.organization_branding
for select to authenticated using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=organization_branding.organization_id
      and m.user_id=(select auth.uid())
  )
  or private.is_platform_privileged()
);

create or replace function private.permission_defaults(p_role text)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select case lower(coalesce(p_role,'viewer'))
    when 'owner' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,'view_integrations',true,'view_reliability',true,
      'view_portfolio',true,'view_enterprise_settings',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_portfolio',true,'manage_kpi_policy',true,'manage_branding',true,
      'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'admin' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,'view_integrations',true,'view_reliability',true,
      'view_portfolio',true,'view_enterprise_settings',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_portfolio',true,'manage_kpi_policy',true,'manage_branding',true,
      'manage_team',true,'manage_permissions',true,'view_billing',true
    )
    when 'manager' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',true,
      'view_site_operations',true,'view_incidents',true,'view_integrations',true,'view_reliability',true,
      'view_portfolio',true,'view_enterprise_settings',true,
      'manage_imports',true,'resolve_data_quality',true,'edit_scorecards',true,'reset_overrides',true,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',true,'run_reliability_checks',true,
      'manage_portfolio',false,'manage_kpi_policy',true,'manage_branding',true,
      'manage_team',true,'manage_permissions',false,'view_billing',false
    )
    when 'dispatcher' then jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'view_site_operations',true,'view_incidents',true,'view_integrations',false,'view_reliability',false,
      'view_portfolio',false,'view_enterprise_settings',false,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',true,'bulk_actions',true,'manage_incidents',true,'manage_integrations',false,'run_reliability_checks',false,
      'manage_portfolio',false,'manage_kpi_policy',false,'manage_branding',false,
      'manage_team',false,'manage_permissions',false,'view_billing',false
    )
    else jsonb_build_object(
      'view_dashboard',true,'view_driver_data',true,'view_scorecards',true,'view_reports',true,'view_audit',false,
      'view_site_operations',true,'view_incidents',true,'view_integrations',false,'view_reliability',false,
      'view_portfolio',false,'view_enterprise_settings',false,
      'manage_imports',false,'resolve_data_quality',false,'edit_scorecards',false,'reset_overrides',false,
      'manage_coaching',false,'bulk_actions',false,'manage_incidents',false,'manage_integrations',false,'run_reliability_checks',false,
      'manage_portfolio',false,'manage_kpi_policy',false,'manage_branding',false,
      'manage_team',false,'manage_permissions',false,'view_billing',false
    )
  end;
$$;

create or replace function public.list_my_workspaces()
returns table(
  organization_id uuid,
  organization_name text,
  plan text,
  role text,
  site_scope text[]
)
language sql
security definer
set search_path to ''
as $$
  select o.id,o.name,o.plan,m.role,coalesce(m.site_scope,'{}'::text[])
  from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=(select auth.uid())
  order by lower(o.name),o.id;
$$;

create or replace function public.list_my_portfolios()
returns table(
  id uuid,
  name text,
  slug text,
  role text,
  organization_count bigint,
  created_at timestamptz
)
language sql
security definer
set search_path to ''
as $$
  select p.id,p.name,p.slug,m.role,count(po.organization_id),p.created_at
  from public.enterprise_portfolios p
  join public.enterprise_portfolio_members m
    on m.portfolio_id=p.id and m.user_id=(select auth.uid())
  left join public.enterprise_portfolio_organizations po on po.portfolio_id=p.id
  group by p.id,p.name,p.slug,m.role,p.created_at
  order by lower(p.name);
$$;

create or replace function public.create_enterprise_portfolio(
  p_name text,
  p_initial_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_slug text;
begin
  if btrim(coalesce(p_name,''))='' then raise exception 'Portfolio name is required'; end if;

  if p_initial_organization_id is not null
     and not private.can_manage_organization_enterprise(p_initial_organization_id) then
    raise exception 'Organisation not accessible' using errcode='42501';
  end if;

  v_slug:=lower(regexp_replace(btrim(p_name),'[^a-zA-Z0-9]+','-','g'));
  v_slug:=trim(both '-' from v_slug)||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,8);

  insert into public.enterprise_portfolios(name,slug,created_by)
  values(btrim(p_name),v_slug,(select auth.uid()))
  returning id into v_id;

  insert into public.enterprise_portfolio_members(portfolio_id,user_id,role)
  values(v_id,(select auth.uid()),'owner');

  if p_initial_organization_id is not null then
    insert into public.enterprise_portfolio_organizations(portfolio_id,organization_id)
    values(v_id,p_initial_organization_id);
  end if;

  return v_id;
end;
$$;

create or replace function public.list_portfolio_organizations(p_portfolio_id uuid)
returns table(
  organization_id uuid,
  organization_name text,
  display_name text,
  region text,
  plan text,
  member_count bigint,
  site_count bigint,
  sort_order integer
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.can_view_portfolio(p_portfolio_id) then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select o.id,o.name,po.display_name,po.region,o.plan,
         (select count(*) from public.organization_members m where m.organization_id=o.id),
         (select count(distinct d.site) from public.drivers d where d.organization_id=o.id and d.site is not null),
         po.sort_order
  from public.enterprise_portfolio_organizations po
  join public.organizations o on o.id=po.organization_id
  where po.portfolio_id=p_portfolio_id
  order by po.sort_order,lower(coalesce(po.display_name,o.name));
end;
$$;

create or replace function public.add_portfolio_organization(
  p_portfolio_id uuid,
  p_organization_id uuid,
  p_display_name text default null,
  p_region text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.can_manage_portfolio(p_portfolio_id) then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if not private.can_manage_organization_enterprise(p_organization_id) then
    raise exception 'Organisation not accessible' using errcode='42501';
  end if;

  insert into public.enterprise_portfolio_organizations(
    portfolio_id,organization_id,display_name,region
  ) values (
    p_portfolio_id,p_organization_id,
    nullif(btrim(coalesce(p_display_name,'')),''),
    nullif(btrim(coalesce(p_region,'')),'')
  )
  on conflict (portfolio_id,organization_id) do update
  set display_name=coalesce(excluded.display_name,public.enterprise_portfolio_organizations.display_name),
      region=coalesce(excluded.region,public.enterprise_portfolio_organizations.region);

  perform public.write_audit_event(
    p_organization_id,'portfolio_linked','enterprise_portfolio',p_portfolio_id::text,
    'Organisation linked to enterprise portfolio',
    null,null,null,'{}'::jsonb,
    jsonb_build_object('portfolio_id',p_portfolio_id,'display_name',p_display_name,'region',p_region),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.remove_portfolio_organization(
  p_portfolio_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.can_manage_portfolio(p_portfolio_id) then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  delete from public.enterprise_portfolio_organizations
  where portfolio_id=p_portfolio_id and organization_id=p_organization_id;

  perform public.write_audit_event(
    p_organization_id,'portfolio_unlinked','enterprise_portfolio',p_portfolio_id::text,
    'Organisation removed from enterprise portfolio',
    null,null,null,'{}'::jsonb,
    jsonb_build_object('portfolio_id',p_portfolio_id),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.list_organization_hierarchy(p_organization_id uuid)
returns table(
  site text,
  display_name text,
  region text,
  country text,
  active boolean,
  driver_count bigint
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_enterprise_settings')
     and not private.has_workspace_permission(p_organization_id,'view_site_operations')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  with sites as (
    select distinct upper(btrim(d.site)) as site
    from public.drivers d
    where d.organization_id=p_organization_id and nullif(btrim(d.site),'') is not null
    union
    select upper(btrim(s.site))
    from public.organization_site_profiles s
    where s.organization_id=p_organization_id
  )
  select sites.site,p.display_name,p.region,p.country,coalesce(p.active,true),
         (select count(*) from public.drivers d
          where d.organization_id=p_organization_id and upper(btrim(d.site))=sites.site and d.status='active')
  from sites
  left join public.organization_site_profiles p
    on p.organization_id=p_organization_id and upper(btrim(p.site))=sites.site
  order by sites.site;
end;
$$;

create or replace function public.upsert_organization_site_profile(
  p_organization_id uuid,
  p_site text,
  p_display_name text default null,
  p_region text default null,
  p_country text default null,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_site text;
begin
  if not private.can_manage_organization_enterprise(p_organization_id) then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  v_site:=upper(btrim(coalesce(p_site,'')));
  if v_site='' then raise exception 'Site is required'; end if;

  insert into public.organization_site_profiles(
    organization_id,site,display_name,region,country,active,updated_by
  ) values (
    p_organization_id,v_site,
    nullif(btrim(coalesce(p_display_name,'')),''),
    nullif(btrim(coalesce(p_region,'')),''),
    nullif(btrim(coalesce(p_country,'')),''),
    coalesce(p_active,true),(select auth.uid())
  )
  on conflict (organization_id,site) do update
  set display_name=excluded.display_name,
      region=excluded.region,
      country=excluded.country,
      active=excluded.active,
      updated_by=(select auth.uid()),
      updated_at=now();

  perform public.write_audit_event(
    p_organization_id,'site_profile_updated','organization_site',v_site,
    'Organisation hierarchy site profile updated',
    null,v_site,null,'{}'::jsonb,
    jsonb_build_object('display_name',p_display_name,'region',p_region,'country',p_country,'active',p_active),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.list_kpi_policies(p_organization_id uuid)
returns table(
  id uuid,
  site text,
  metric text,
  target numeric,
  direction text,
  warning_margin numeric,
  unit text,
  enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_enterprise_settings')
     and not private.has_workspace_permission(p_organization_id,'view_dashboard')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  select p.id,p.site,p.metric,p.target,p.direction,p.warning_margin,p.unit,p.enabled,p.updated_at
  from public.organization_kpi_policies p
  where p.organization_id=p_organization_id
  order by coalesce(p.site,''),p.metric;
end;
$$;

create or replace function public.upsert_kpi_policy(
  p_organization_id uuid,
  p_site text,
  p_metric text,
  p_target numeric,
  p_direction text default 'gte',
  p_warning_margin numeric default 0,
  p_unit text default 'percent',
  p_enabled boolean default true
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid; v_site text; v_metric text;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_kpi_policy')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if p_direction not in ('gte','lte') then raise exception 'Invalid direction'; end if;
  if p_unit not in ('percent','score','dpmo','count') then raise exception 'Invalid unit'; end if;

  v_site:=nullif(upper(btrim(coalesce(p_site,''))),'');
  v_metric:=lower(btrim(coalesce(p_metric,'')));
  if v_metric not in ('dcr','pod','iadc','mentor','cc','psb','reattempts','dsc_dpmo','lor','ce_dpmo','cdf_dpmo','concessions','total_score') then
    raise exception 'Unsupported KPI metric';
  end if;

  insert into public.organization_kpi_policies(
    organization_id,site,metric,target,direction,warning_margin,unit,enabled,updated_by
  ) values (
    p_organization_id,v_site,v_metric,p_target,p_direction,coalesce(p_warning_margin,0),p_unit,coalesce(p_enabled,true),(select auth.uid())
  )
  on conflict (organization_id,coalesce(site,'*'),metric) do update
  set target=excluded.target,
      direction=excluded.direction,
      warning_margin=excluded.warning_margin,
      unit=excluded.unit,
      enabled=excluded.enabled,
      updated_by=(select auth.uid()),
      updated_at=now()
  returning id into v_id;

  perform public.write_audit_event(
    p_organization_id,'kpi_policy_updated','kpi_policy',v_id::text,
    'Enterprise KPI policy updated',
    null,v_site,null,'{}'::jsonb,
    jsonb_build_object('site',v_site,'metric',v_metric,'target',p_target,'direction',p_direction,'warning_margin',p_warning_margin,'unit',p_unit,'enabled',p_enabled),
    '{}'::jsonb
  );

  return v_id;
end;
$$;

create or replace function public.delete_kpi_policy(p_policy_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_org uuid; v_site text; v_metric text;
begin
  select organization_id,site,metric into v_org,v_site,v_metric
  from public.organization_kpi_policies where id=p_policy_id;
  if v_org is null then raise exception 'Policy not found'; end if;

  if not private.has_workspace_permission(v_org,'manage_kpi_policy')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  delete from public.organization_kpi_policies where id=p_policy_id;

  perform public.write_audit_event(
    v_org,'kpi_policy_deleted','kpi_policy',p_policy_id::text,
    'Enterprise KPI policy removed',
    null,v_site,null,jsonb_build_object('metric',v_metric),'{}'::jsonb,'{}'::jsonb
  );
end;
$$;

create or replace function public.get_organization_branding(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_brand jsonb;
begin
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=(select auth.uid())
  ) and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  select to_jsonb(b) into v_brand
  from public.organization_branding b
  where b.organization_id=p_organization_id;

  return coalesce(v_brand,jsonb_build_object(
    'organization_id',p_organization_id,
    'brand_name',null,
    'accent_color','#66E3CE',
    'secondary_color','#9B90FF',
    'logo_url',null,
    'footer_text',null,
    'show_metrixiq_brand',true
  ));
end;
$$;

create or replace function public.update_organization_branding(
  p_organization_id uuid,
  p_brand_name text default null,
  p_accent_color text default '#66E3CE',
  p_secondary_color text default '#9B90FF',
  p_logo_url text default null,
  p_footer_text text default null,
  p_show_metrixiq_brand boolean default true
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'manage_branding')
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  if coalesce(p_accent_color,'') !~ '^#[0-9A-Fa-f]{6}$'
     or coalesce(p_secondary_color,'') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Brand colours must use #RRGGBB';
  end if;
  if nullif(btrim(coalesce(p_logo_url,'')),'') is not null
     and p_logo_url !~ '^https://[A-Za-z0-9._~:/?#\[\]@!$&''()*+,;=%-]+$' then
    raise exception 'Logo URL must use HTTPS';
  end if;

  insert into public.organization_branding(
    organization_id,brand_name,accent_color,secondary_color,logo_url,footer_text,show_metrixiq_brand,updated_by
  ) values (
    p_organization_id,
    nullif(btrim(coalesce(p_brand_name,'')),''),
    upper(p_accent_color),upper(p_secondary_color),
    nullif(btrim(coalesce(p_logo_url,'')),''),
    nullif(btrim(coalesce(p_footer_text,'')),''),
    coalesce(p_show_metrixiq_brand,true),(select auth.uid())
  )
  on conflict (organization_id) do update
  set brand_name=excluded.brand_name,
      accent_color=excluded.accent_color,
      secondary_color=excluded.secondary_color,
      logo_url=excluded.logo_url,
      footer_text=excluded.footer_text,
      show_metrixiq_brand=excluded.show_metrixiq_brand,
      updated_by=(select auth.uid()),
      updated_at=now();

  perform public.write_audit_event(
    p_organization_id,'branding_updated','organization_branding',p_organization_id::text,
    'Workspace white-label branding updated',
    null,null,null,'{}'::jsonb,
    jsonb_build_object('brand_name',p_brand_name,'accent_color',p_accent_color,'secondary_color',p_secondary_color,'logo_url',p_logo_url,'footer_text',p_footer_text,'show_metrixiq_brand',p_show_metrixiq_brand),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.list_portfolio_benchmark(
  p_portfolio_id uuid,
  p_week_label text default null
)
returns table(
  organization_id uuid,
  organization_name text,
  region text,
  site text,
  week_label text,
  site_score numeric,
  standing text,
  site_rank integer,
  driver_count bigint,
  average_driver_score numeric,
  average_fico numeric,
  average_dcr numeric,
  average_pod numeric,
  average_cc numeric,
  concessions numeric,
  fair_poor bigint,
  benchmark_rank bigint
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.can_view_portfolio(p_portfolio_id) then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  return query
  with portfolio_orgs as (
    select po.organization_id,coalesce(po.display_name,o.name) as organization_name,po.region
    from public.enterprise_portfolio_organizations po
    join public.organizations o on o.id=po.organization_id
    where po.portfolio_id=p_portfolio_id
  ),
  metric_base as (
    select dm.*,d.site,d.full_name,
           private.driver_point_score(
             coalesce(dm.mentor_score,dm.ementor,dm.fico),
             dm.dcr,dm.dsc_dpmo,dm.lor,dm.pod,dm.cc,dm.ce_dpmo,dm.cdf_dpmo,dm.psb,dm.raw_data
           ) as total_score,
           row_number() over (
             partition by dm.organization_id,dm.driver_id
             order by coalesce(dm.period_end,dm.period_start) desc nulls last,dm.created_at desc
           ) as rn
    from public.driver_metrics dm
    join public.drivers d on d.id=dm.driver_id
    join portfolio_orgs po on po.organization_id=dm.organization_id
    where p_week_label is null or dm.week_label=p_week_label
  ),
  driver_agg as (
    select m.organization_id,upper(btrim(m.site)) as site,max(m.week_label) as week_label,
           count(*) filter (where m.rn=1) as driver_count,
           round(avg(m.total_score) filter (where m.rn=1),2) as average_driver_score,
           round(avg(coalesce(m.mentor_score,m.ementor,m.fico)) filter (where m.rn=1),2) as average_fico,
           round(avg(case when m.dcr between 0 and 1 then m.dcr*100 else m.dcr end) filter (where m.rn=1),2) as average_dcr,
           round(avg(case when m.pod between 0 and 1 then m.pod*100 else m.pod end) filter (where m.rn=1),2) as average_pod,
           round(avg(case when m.cc between 0 and 1 then m.cc*100 else m.cc end) filter (where m.rn=1),2) as average_cc,
           coalesce(sum(m.concessions) filter (where m.rn=1),0) as concessions,
           count(*) filter (where m.rn=1 and m.total_score<70) as fair_poor
    from metric_base m
    where m.site is not null
    group by m.organization_id,upper(btrim(m.site))
  ),
  card_ranked as (
    select sc.*,
           row_number() over (
             partition by sc.organization_id,upper(btrim(sc.site))
             order by sc.year desc,sc.week desc,sc.updated_at desc
           ) as rn
    from public.site_scorecards sc
    join portfolio_orgs po on po.organization_id=sc.organization_id
    where p_week_label is null or sc.week_label=p_week_label
  ),
  combined as (
    select a.organization_id,po.organization_name,coalesce(sp.region,po.region) as region,a.site,a.week_label,
           cr.overall_score as site_score,cr.standing,cr.site_rank,
           a.driver_count,a.average_driver_score,a.average_fico,a.average_dcr,a.average_pod,a.average_cc,
           a.concessions,a.fair_poor
    from driver_agg a
    join portfolio_orgs po on po.organization_id=a.organization_id
    left join public.organization_site_profiles sp
      on sp.organization_id=a.organization_id and upper(btrim(sp.site))=a.site
    left join card_ranked cr
      on cr.organization_id=a.organization_id and upper(btrim(cr.site))=a.site and cr.rn=1
  )
  select c.*,
         dense_rank() over (order by c.average_driver_score desc nulls last) as benchmark_rank
  from combined c
  order by benchmark_rank,c.organization_name,c.site;
end;
$$;

grant execute on function public.list_my_workspaces() to authenticated;
grant execute on function public.list_my_portfolios() to authenticated;
grant execute on function public.create_enterprise_portfolio(text,uuid) to authenticated;
grant execute on function public.list_portfolio_organizations(uuid) to authenticated;
grant execute on function public.add_portfolio_organization(uuid,uuid,text,text) to authenticated;
grant execute on function public.remove_portfolio_organization(uuid,uuid) to authenticated;
grant execute on function public.list_organization_hierarchy(uuid) to authenticated;
grant execute on function public.upsert_organization_site_profile(uuid,text,text,text,text,boolean) to authenticated;
grant execute on function public.list_kpi_policies(uuid) to authenticated;
grant execute on function public.upsert_kpi_policy(uuid,text,text,numeric,text,numeric,text,boolean) to authenticated;
grant execute on function public.delete_kpi_policy(uuid) to authenticated;
grant execute on function public.get_organization_branding(uuid) to authenticated;
grant execute on function public.update_organization_branding(uuid,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.list_portfolio_benchmark(uuid,text) to authenticated;

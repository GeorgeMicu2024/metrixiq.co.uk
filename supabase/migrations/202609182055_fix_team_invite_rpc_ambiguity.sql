-- Fix ambiguous output-column references in team invite RPCs.
-- Applied to production Supabase on 2026-09-18.

create or replace function public.list_team_invites(p_organization_id uuid)
returns table(token uuid, email text, role text, site_scope text[], status text, created_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  ) and not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','manager')
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  update public.workspace_invites wi
     set status='expired'
   where wi.organization_id=p_organization_id
     and wi.status='pending'
     and wi.expires_at <= now();

  return query
  select wi.token, wi.email, wi.role, wi.site_scope, wi.status, wi.created_at, wi.expires_at
  from public.workspace_invites wi
  where wi.organization_id = p_organization_id
    and wi.status = 'pending'
  order by wi.created_at desc;
end;
$function$;

create or replace function public.create_team_invite(
  p_organization_id uuid,
  p_email text,
  p_role text default 'viewer',
  p_site_scope text[] default '{}'::text[]
)
returns table(token uuid, status text, member_user_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_user_id uuid;
  v_token uuid;
  v_sites text[];
begin
  if not exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  ) and not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','manager')
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'Enter a valid email address';
  end if;

  if p_role not in ('manager','dispatcher','viewer') then
    raise exception 'Invalid team role';
  end if;

  select coalesce(
           array_agg(distinct upper(btrim(x))) filter (where btrim(x) <> ''),
           '{}'::text[]
         )
    into v_sites
  from unnest(coalesce(p_site_scope,'{}'::text[])) as x;

  select p.id into v_user_id
  from public.profiles p
  where lower(p.email)=v_email
  limit 1;

  if v_user_id is not null then
    if exists (
      select 1 from public.organization_members om
      where om.user_id=v_user_id and om.organization_id <> p_organization_id
    ) then
      raise exception 'This account already belongs to another workspace';
    end if;

    insert into public.organization_members(organization_id,user_id,role,site_scope)
    values(p_organization_id,v_user_id,p_role,v_sites)
    on conflict (organization_id,user_id) do update
      set role=excluded.role, site_scope=excluded.site_scope;

    update public.workspace_invites wi
       set status='accepted', accepted_at=now(), accepted_by=v_user_id
     where wi.organization_id=p_organization_id
       and lower(wi.email)=v_email
       and wi.status='pending';

    return query select null::uuid, 'accepted'::text, v_user_id;
    return;
  end if;

  update public.workspace_invites wi
     set status='cancelled'
   where wi.organization_id=p_organization_id
     and lower(wi.email)=v_email
     and wi.status='pending';

  insert into public.workspace_invites(organization_id,email,role,site_scope,invited_by)
  values(p_organization_id,v_email,p_role,v_sites,auth.uid())
  returning workspace_invites.token into v_token;

  return query select v_token, 'pending'::text, null::uuid;
end;
$function$;

-- Team Invite Delivery & Access Fix
-- Ensures invited users are attached to the invited workspace as soon as their Auth user exists,
-- even before the first /app load. Keeps workspace isolation intact.

create or replace function private.attach_pending_workspace_invite(
  p_user_id uuid,
  p_email text
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_invite public.workspace_invites%rowtype;
  v_count integer := 0;
begin
  if p_user_id is null or v_email='' then
    return 0;
  end if;

  update public.workspace_invites wi
     set status='expired'
   where lower(wi.email)=v_email
     and wi.status='pending'
     and wi.expires_at<=now();

  select wi.*
    into v_invite
  from public.workspace_invites wi
  where lower(wi.email)=v_email
    and wi.status='pending'
    and wi.expires_at>now()
  order by wi.created_at
  limit 1;

  if not found then
    return 0;
  end if;

  -- Preserve the existing single-workspace safety rule for ordinary users.
  if exists (
    select 1
    from public.organization_members om
    where om.user_id=p_user_id
      and om.organization_id<>v_invite.organization_id
  ) then
    return 0;
  end if;

  insert into public.organization_members(
    organization_id,user_id,role,site_scope
  )
  values(
    v_invite.organization_id,
    p_user_id,
    v_invite.role,
    coalesce(v_invite.site_scope,'{}'::text[])
  )
  on conflict (organization_id,user_id) do update
    set role=excluded.role,
        site_scope=excluded.site_scope;

  update public.workspace_invites wi
     set status='accepted',
         accepted_at=now(),
         accepted_by=p_user_id
   where wi.token=v_invite.token;

  -- Cancel duplicate pending invites for the same user/workspace/email.
  update public.workspace_invites wi
     set status='cancelled'
   where wi.organization_id=v_invite.organization_id
     and lower(wi.email)=v_email
     and wi.status='pending'
     and wi.token<>v_invite.token;

  return 1;
end;
$function$;

revoke all on function private.attach_pending_workspace_invite(uuid,text) from public;
revoke all on function private.attach_pending_workspace_invite(uuid,text) from authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.profiles (id,email,full_name)
  values(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name')
  )
  on conflict (id) do update
    set email=excluded.email,
        full_name=coalesce(excluded.full_name,public.profiles.full_name),
        updated_at=now();

  -- Only grant workspace access after Supabase has verified the mailbox.
  -- The auth.users trigger also runs on UPDATE, so email confirmation / invite
  -- acceptance attaches the pending workspace automatically.
  if new.email_confirmed_at is not null then
    perform private.attach_pending_workspace_invite(new.id,new.email);
  end if;

  return new;
end;
$function$;

create or replace function public.redeem_my_pending_invites()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null or v_email='' then
    return 0;
  end if;

  return private.attach_pending_workspace_invite(auth.uid(),v_email);
end;
$function$;

grant execute on function public.redeem_my_pending_invites() to authenticated;


create or replace function public.create_team_invite(
  p_organization_id uuid,
  p_email text,
  p_role text default 'viewer',
  p_site_scope text[] default '{}'::text[]
)
returns table(token uuid,status text,member_user_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_user_id uuid;
  v_token uuid;
  v_sites text[];
begin
  if not exists (
    select 1 from public.platform_admins pa where pa.user_id=auth.uid()
  ) and not exists (
    select 1 from public.organization_members om
    where om.organization_id=p_organization_id
      and om.user_id=auth.uid()
      and om.role in ('owner','admin','manager')
  ) then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  if v_email='' or position('@' in v_email)<2 then
    raise exception 'Enter a valid email address';
  end if;
  if p_role not in ('manager','dispatcher','viewer') then
    raise exception 'Invalid team role';
  end if;

  select coalesce(
    array_agg(distinct upper(btrim(x))) filter(where btrim(x)<>''),
    '{}'::text[]
  )
  into v_sites
  from unnest(coalesce(p_site_scope,'{}'::text[])) as x;

  -- Only an email-verified Auth account is eligible for immediate membership.
  -- An unverified / invited Auth user stays pending until mailbox verification.
  select p.id
    into v_user_id
  from public.profiles p
  join auth.users au on au.id=p.id
  where lower(p.email)=v_email
    and au.email_confirmed_at is not null
  limit 1;

  if v_user_id is not null then
    if exists (
      select 1 from public.organization_members om
      where om.user_id=v_user_id
        and om.organization_id<>p_organization_id
    ) then
      raise exception 'This account already belongs to another workspace';
    end if;

    insert into public.organization_members(organization_id,user_id,role,site_scope)
    values(p_organization_id,v_user_id,p_role,v_sites)
    on conflict (organization_id,user_id) do update
      set role=excluded.role,site_scope=excluded.site_scope;

    update public.workspace_invites wi
       set status='accepted',accepted_at=now(),accepted_by=v_user_id
     where wi.organization_id=p_organization_id
       and lower(wi.email)=v_email
       and wi.status='pending';

    return query select null::uuid,'accepted'::text,v_user_id;
    return;
  end if;

  update public.workspace_invites wi
     set status='cancelled'
   where wi.organization_id=p_organization_id
     and lower(wi.email)=v_email
     and wi.status='pending';

  insert into public.workspace_invites(
    organization_id,email,role,site_scope,invited_by
  )
  values(
    p_organization_id,v_email,p_role,v_sites,auth.uid()
  )
  returning workspace_invites.token into v_token;

  return query select v_token,'pending'::text,null::uuid;
end;
$function$;

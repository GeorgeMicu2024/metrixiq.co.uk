-- Secure token-based team invite signup fallback
-- Allows an invited user holding the random invite token to complete onboarding
-- without relying on public email-confirmation signup.

create or replace function public.get_team_invite_signup_context(
  p_token uuid,
  p_email text
)
returns table(
  organization_id uuid,
  organization_name text,
  invited_email text,
  invited_role text,
  site_scope text[],
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare v_email text:=lower(btrim(coalesce(p_email,'')));
begin
  if p_token is null or v_email='' then return; end if;

  return query
  select wi.organization_id,o.name,wi.email,wi.role,wi.site_scope,wi.expires_at
  from public.workspace_invites wi
  join public.organizations o on o.id=wi.organization_id
  where wi.token=p_token
    and lower(wi.email)=v_email
    and wi.status='pending'
    and wi.expires_at>now()
  limit 1;
end;
$function$;

revoke all on function public.get_team_invite_signup_context(uuid,text) from public;
revoke all on function public.get_team_invite_signup_context(uuid,text) from anon;
revoke all on function public.get_team_invite_signup_context(uuid,text) from authenticated;
grant execute on function public.get_team_invite_signup_context(uuid,text) to service_role;

create or replace function public.complete_team_invite_signup(
  p_token uuid,
  p_user_id uuid,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_auth_email text;
  v_invite public.workspace_invites%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select lower(email) into v_auth_email
  from auth.users
  where id=p_user_id;

  if v_auth_email is null or v_auth_email<>v_email then
    raise exception 'Auth user does not match invited email';
  end if;

  select wi.* into v_invite
  from public.workspace_invites wi
  where wi.token=p_token
    and lower(wi.email)=v_email
    and wi.status='pending'
    and wi.expires_at>now()
  for update;

  if not found then
    raise exception 'Invitation is invalid or expired';
  end if;

  if exists (
    select 1
    from public.organization_members om
    where om.user_id=p_user_id
      and om.organization_id<>v_invite.organization_id
  ) then
    raise exception 'This account already belongs to another workspace';
  end if;

  insert into public.organization_members(
    organization_id,user_id,role,site_scope
  )
  values(
    v_invite.organization_id,p_user_id,v_invite.role,coalesce(v_invite.site_scope,'{}'::text[])
  )
  on conflict (organization_id,user_id) do update
    set role=excluded.role,
        site_scope=excluded.site_scope;

  update public.workspace_invites
  set status='accepted',
      accepted_at=now(),
      accepted_by=p_user_id
  where token=p_token;

  update public.workspace_invites
  set status='cancelled'
  where organization_id=v_invite.organization_id
    and lower(email)=v_email
    and status='pending'
    and token<>p_token;

  return true;
end;
$function$;

revoke all on function public.complete_team_invite_signup(uuid,uuid,text) from public;
revoke all on function public.complete_team_invite_signup(uuid,uuid,text) from anon;
revoke all on function public.complete_team_invite_signup(uuid,uuid,text) from authenticated;
grant execute on function public.complete_team_invite_signup(uuid,uuid,text) to service_role;

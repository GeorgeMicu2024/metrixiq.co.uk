-- Auth, account and team access hardening for the V2 control plane.
create or replace function public.update_my_profile(p_full_name text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.profiles set full_name=nullif(btrim(coalesce(p_full_name,'')),''), updated_at=now() where id=auth.uid();
  return found;
end $$;
revoke all on function public.update_my_profile(text) from public, anon;
grant execute on function public.update_my_profile(text) to authenticated;

create or replace function public.resend_team_invite(p_organization_id uuid,p_token uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_new uuid:=gen_random_uuid(); v_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.platform_admins pa where pa.user_id=auth.uid())
     and not exists(select 1 from public.organization_members om where om.organization_id=p_organization_id and om.user_id=auth.uid() and om.role in ('owner','admin','manager'))
  then raise exception 'Not authorised' using errcode='42501'; end if;
  select email into v_email from public.workspace_invites where organization_id=p_organization_id and token=p_token and status='pending' for update;
  if v_email is null then raise exception 'Pending invitation not found'; end if;
  update public.workspace_invites set token=v_new,created_at=now(),expires_at=now()+interval '14 days' where organization_id=p_organization_id and token=p_token;
  insert into public.audit_events(organization_id,actor_id,event_type,entity_type,entity_id,action,metadata)
  values(p_organization_id,auth.uid(),'team_invite_resent','workspace_invite',v_new::text,'resend',jsonb_build_object('email',v_email));
  return v_new;
end $$;
revoke all on function public.resend_team_invite(uuid,uuid) from public, anon;
grant execute on function public.resend_team_invite(uuid,uuid) to authenticated;

revoke all on function public.admin_list_accounts() from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;
revoke all on function public.admin_list_pending_invites() from public, anon;
grant execute on function public.admin_list_pending_invites() to authenticated;
revoke all on function public.admin_set_workspace_plan(uuid,text,text) from public, anon;
grant execute on function public.admin_set_workspace_plan(uuid,text,text) to authenticated;
revoke all on function public.admin_set_workspace_suspension(uuid,boolean,text) from public, anon;
grant execute on function public.admin_set_workspace_suspension(uuid,boolean,text) to authenticated;
revoke all on function public.create_team_invite(uuid,text,text,text[]) from public, anon;
grant execute on function public.create_team_invite(uuid,text,text,text[]) to authenticated;
revoke all on function public.list_team_invites(uuid) from public, anon;
grant execute on function public.list_team_invites(uuid) to authenticated;
revoke all on function public.cancel_team_invite(uuid,uuid) from public, anon;
grant execute on function public.cancel_team_invite(uuid,uuid) to authenticated;

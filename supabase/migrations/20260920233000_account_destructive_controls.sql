-- Destructive account controls with ownership and platform-admin protections.
create or replace function public.admin_prepare_user_deletion(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text; v_owner_count int; v_memberships int;
begin
 if auth.uid() is null or not exists(select 1 from public.platform_admins where user_id=auth.uid()) then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_user_id=auth.uid() then raise exception 'You cannot delete your own platform administrator account.' using errcode='42501'; end if;
 select email into v_email from auth.users where id=p_user_id;
 if v_email is null then raise exception 'User not found'; end if;
 if exists(select 1 from public.platform_admins where user_id=p_user_id) then raise exception 'Remove platform administrator access before deleting this account.' using errcode='42501'; end if;
 select count(*) into v_owner_count from public.organization_members om where om.user_id=p_user_id and om.role='owner'
 and not exists(select 1 from public.organization_members other where other.organization_id=om.organization_id and other.user_id<>p_user_id and other.role='owner');
 if v_owner_count>0 then raise exception 'Transfer workspace ownership before deleting this account.' using errcode='42501'; end if;
 select count(*) into v_memberships from public.organization_members where user_id=p_user_id;
 insert into public.audit_events(organization_id,actor_id,event_type,entity_type,entity_id,action,metadata)
 values(null,auth.uid(),'admin_user_delete_prepared','user',p_user_id::text,'delete_prepare',jsonb_build_object('email',v_email,'memberships',v_memberships));
 return jsonb_build_object('allowed',true,'user_id',p_user_id,'email',v_email,'memberships',v_memberships);
end $$;
revoke all on function public.admin_prepare_user_deletion(uuid) from public,anon;
grant execute on function public.admin_prepare_user_deletion(uuid) to authenticated;

create or replace function public.admin_reset_user_access(p_user_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count int;
begin
 if auth.uid() is null or not exists(select 1 from public.platform_admins where user_id=auth.uid()) then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_user_id=auth.uid() then raise exception 'You cannot reset your own platform administrator access.' using errcode='42501'; end if;
 if exists(select 1 from public.platform_admins where user_id=p_user_id) then raise exception 'Platform administrator access cannot be reset here.' using errcode='42501'; end if;
 if exists(select 1 from public.organization_members om where om.user_id=p_user_id and om.role='owner' and not exists(select 1 from public.organization_members x where x.organization_id=om.organization_id and x.user_id<>p_user_id and x.role='owner')) then raise exception 'Transfer sole workspace ownership before resetting this user.' using errcode='42501'; end if;
 delete from public.member_permission_overrides where user_id=p_user_id;
 update public.organization_members set role='viewer',site_scope='{}'::text[] where user_id=p_user_id and role<>'owner';
 get diagnostics v_count=row_count;
 insert into public.audit_events(organization_id,actor_id,event_type,entity_type,entity_id,action,metadata)
 values(null,auth.uid(),'admin_user_access_reset','user',p_user_id::text,'reset_access',jsonb_build_object('memberships_updated',v_count));
 return v_count;
end $$;
revoke all on function public.admin_reset_user_access(uuid) from public,anon;
grant execute on function public.admin_reset_user_access(uuid) to authenticated;

create or replace function public.prepare_my_account_deletion()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner_count int; v_email text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if exists(select 1 from public.platform_admins where user_id=auth.uid()) then raise exception 'Platform administrators cannot self-delete. Transfer platform control first.' using errcode='42501'; end if;
 select count(*) into v_owner_count from public.organization_members om where om.user_id=auth.uid() and om.role='owner' and not exists(select 1 from public.organization_members other where other.organization_id=om.organization_id and other.user_id<>auth.uid() and other.role='owner');
 if v_owner_count>0 then raise exception 'Transfer workspace ownership before deleting your account.' using errcode='42501'; end if;
 select email into v_email from auth.users where id=auth.uid();
 insert into public.audit_events(organization_id,actor_id,event_type,entity_type,entity_id,action,metadata)
 values(null,auth.uid(),'account_delete_prepared','user',auth.uid()::text,'delete_prepare',jsonb_build_object('email',v_email));
 return jsonb_build_object('allowed',true,'user_id',auth.uid(),'email',v_email);
end $$;
revoke all on function public.prepare_my_account_deletion() from public,anon;
grant execute on function public.prepare_my_account_deletion() to authenticated;

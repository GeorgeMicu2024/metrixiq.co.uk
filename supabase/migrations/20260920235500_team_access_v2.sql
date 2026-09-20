-- Team & Access V2
-- Reproducible ownership transfer, per-member permission overrides and workspace access audit.

create or replace function public.transfer_workspace_ownership(p_organization_id uuid,p_new_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role text;
  v_previous_owner uuid;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;

  select role into v_actor_role from public.organization_members
  where organization_id=p_organization_id and user_id=v_actor;

  if coalesce(v_actor_role,'') <> 'owner' and not private.is_platform_privileged() then
    raise exception 'Only the workspace owner can transfer ownership' using errcode='42501';
  end if;

  if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_new_owner_id) then
    raise exception 'New owner must already be a workspace member';
  end if;

  select user_id into v_previous_owner from public.organization_members
  where organization_id=p_organization_id and role='owner' and user_id<>p_new_owner_id
  order by joined_at asc nulls last limit 1;

  update public.organization_members set role='admin'
  where organization_id=p_organization_id and role='owner' and user_id<>p_new_owner_id;

  update public.organization_members set role='owner',site_scope='{}'::text[]
  where organization_id=p_organization_id and user_id=p_new_owner_id;

  insert into public.audit_events(organization_id,actor_id,event_type,entity_type,entity_id,action,before_data,after_data,metadata)
  values(p_organization_id,v_actor,'workspace_ownership_transferred','organization',p_organization_id::text,'transfer_ownership',
    jsonb_build_object('owner_id',v_previous_owner),jsonb_build_object('owner_id',p_new_owner_id),jsonb_build_object('new_owner_id',p_new_owner_id));
  return true;
end;
$$;

create or replace function public.set_member_permission_overrides(p_organization_id uuid,p_user_id uuid,p_permissions jsonb)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_allowed text[] := array[
    'view_dashboard','view_driver_data','view_scorecards','view_reports','view_audit','view_site_operations',
    'view_incidents','view_integrations','view_reliability','view_portfolio','view_enterprise_settings','view_workflows',
    'view_developer_platform','manage_imports','resolve_data_quality','edit_scorecards','reset_overrides','manage_coaching',
    'bulk_actions','manage_incidents','manage_integrations','run_reliability_checks','manage_portfolio','manage_kpi_policy',
    'manage_branding','manage_automations','manage_workflows','approve_workflows','manage_api_keys','manage_webhooks',
    'manage_delivery','manage_team','manage_permissions','view_billing'
  ];
  v_key text;
  v_before jsonb;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.has_workspace_permission(p_organization_id,'manage_permissions') then
    raise exception 'Permission management access required' using errcode='42501';
  end if;
  if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_user_id) then
    raise exception 'Member not found';
  end if;
  if jsonb_typeof(coalesce(p_permissions,'{}'::jsonb)) <> 'object' then raise exception 'Permissions must be a JSON object'; end if;
  for v_key in select jsonb_object_keys(coalesce(p_permissions,'{}'::jsonb)) loop
    if not (v_key=any(v_allowed)) then raise exception 'Unsupported permission: %',v_key; end if;
    if jsonb_typeof(p_permissions->v_key) <> 'boolean' then raise exception 'Permission % must be boolean',v_key; end if;
  end loop;

  select permissions into v_before from public.member_permission_overrides where organization_id=p_organization_id and user_id=p_user_id;
  if coalesce(p_permissions,'{}'::jsonb)='{}'::jsonb then
    delete from public.member_permission_overrides where organization_id=p_organization_id and user_id=p_user_id;
  else
    insert into public.member_permission_overrides(organization_id,user_id,permissions,updated_by,updated_at)
    values(p_organization_id,p_user_id,p_permissions,v_actor,now())
    on conflict(organization_id,user_id) do update set permissions=excluded.permissions,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end if;

  insert into public.audit_events(organization_id,actor_id,event_type,entity_type,entity_id,action,before_data,after_data)
  values(p_organization_id,v_actor,'team_permissions_updated','organization_member',p_user_id::text,'set_permission_overrides',
    coalesce(v_before,'{}'::jsonb),coalesce(p_permissions,'{}'::jsonb));
  return true;
end;
$$;

create or replace function public.list_member_permission_overrides(p_organization_id uuid)
returns table(user_id uuid,permissions jsonb,updated_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'manage_team')
     and not private.has_workspace_permission(p_organization_id,'manage_permissions') then
    raise exception 'Team management access required' using errcode='42501';
  end if;
  return query select o.user_id,o.permissions,o.updated_at from public.member_permission_overrides o where o.organization_id=p_organization_id;
end;
$$;

create or replace function public.list_workspace_audit_events(p_organization_id uuid,p_limit integer default 50)
returns table(id uuid,event_type text,entity_type text,entity_id text,action text,metadata jsonb,created_at timestamptz,actor_id uuid,actor_name text)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.has_workspace_permission(p_organization_id,'view_audit')
     and not private.has_workspace_permission(p_organization_id,'manage_team') then
    raise exception 'Audit access required' using errcode='42501';
  end if;
  return query
    select a.id,a.event_type,a.entity_type,a.entity_id,a.action,a.metadata,a.created_at,a.actor_id,p.full_name
    from public.audit_events a left join public.profiles p on p.id=a.actor_id
    where a.organization_id=p_organization_id order by a.created_at desc
    limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;

revoke execute on function public.transfer_workspace_ownership(uuid,uuid) from public,anon;
revoke execute on function public.set_member_permission_overrides(uuid,uuid,jsonb) from public,anon;
revoke execute on function public.list_member_permission_overrides(uuid) from public,anon;
revoke execute on function public.list_workspace_audit_events(uuid,integer) from public,anon;
grant execute on function public.transfer_workspace_ownership(uuid,uuid) to authenticated,service_role;
grant execute on function public.set_member_permission_overrides(uuid,uuid,jsonb) to authenticated,service_role;
grant execute on function public.list_member_permission_overrides(uuid) to authenticated,service_role;
grant execute on function public.list_workspace_audit_events(uuid,integer) to authenticated,service_role;

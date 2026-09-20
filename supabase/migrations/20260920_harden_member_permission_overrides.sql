-- Harden permission overrides against privilege escalation.
-- Only platform-privileged actors may override owner/admin permissions.
-- Permission payloads must be non-null JSON objects with allowlisted boolean values.

create or replace function public.set_member_permission_overrides(p_organization_id uuid, p_user_id uuid, p_permissions jsonb)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_target_role text;
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

  select role into v_target_role
  from public.organization_members
  where organization_id=p_organization_id and user_id=p_user_id;

  if v_target_role is null then raise exception 'Member not found'; end if;
  if v_target_role in ('owner','admin') and not private.is_platform_privileged() then
    raise exception 'Owner/admin permission overrides are protected' using errcode='42501';
  end if;

  if p_permissions is null or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Permissions must be a JSON object';
  end if;
  for v_key in select jsonb_object_keys(p_permissions) loop
    if not (v_key=any(v_allowed)) then raise exception 'Unsupported permission: %',v_key; end if;
    if jsonb_typeof(p_permissions->v_key) <> 'boolean' then raise exception 'Permission % must be boolean',v_key; end if;
  end loop;

  select permissions into v_before
  from public.member_permission_overrides
  where organization_id=p_organization_id and user_id=p_user_id;

  if p_permissions='{}'::jsonb then
    delete from public.member_permission_overrides
    where organization_id=p_organization_id and user_id=p_user_id;
  else
    insert into public.member_permission_overrides(organization_id,user_id,permissions,updated_by,updated_at)
    values(p_organization_id,p_user_id,p_permissions,v_actor,now())
    on conflict(organization_id,user_id) do update
    set permissions=excluded.permissions,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end if;

  insert into public.audit_events(organization_id,actor_id,event_type,entity_type,entity_id,action,before_data,after_data)
  values(p_organization_id,v_actor,'team_permissions_updated','organization_member',p_user_id::text,'set_permission_overrides',
    coalesce(v_before,'{}'::jsonb),p_permissions);
  return true;
end;
$function$;

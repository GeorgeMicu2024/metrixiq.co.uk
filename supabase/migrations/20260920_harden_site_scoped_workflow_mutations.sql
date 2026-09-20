-- Harden site-scoped SECURITY DEFINER mutations against cross-site access.

create or replace function public.update_notification_status(p_notification_id uuid, p_status text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_row public.notification_events%rowtype;
begin
  if p_status not in ('unread','read','reviewed','dismissed') then raise exception 'Invalid notification status'; end if;
  select * into v_row from public.notification_events where id=p_notification_id;
  if not found then raise exception 'Notification not found'; end if;
  if not public.is_workspace_member(v_row.organization_id) and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  if v_row.driver_id is not null and not private.is_platform_privileged()
     and not private.can_access_driver(v_row.organization_id,v_row.driver_id) then
    raise exception 'Driver not accessible' using errcode='42501';
  end if;
  if v_row.site is not null and not private.is_platform_privileged()
     and not private.can_access_site(v_row.organization_id,v_row.site) then
    raise exception 'Site not accessible' using errcode='42501';
  end if;
  update public.notification_events
  set status=p_status,
      read_at=case when p_status in ('read','reviewed','dismissed') then coalesce(read_at,now()) else null end,
      reviewed_at=case when p_status='reviewed' then coalesce(reviewed_at,now()) when p_status='unread' then null else reviewed_at end,
      updated_at=now()
  where id=p_notification_id;
end;
$function$;

create or replace function public.request_entity_approval(p_organization_id uuid, p_entity_type text, p_entity_id text, p_request_type text, p_title text, p_detail text default null::text, p_priority text default 'medium'::text, p_driver_id uuid default null::uuid, p_site text default null::text, p_dedupe_key text default null::text, p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_id uuid;
begin
  if not private.has_workspace_permission(p_organization_id,'manage_workflows')
     and not private.is_platform_privileged() then raise exception 'Not authorised' using errcode='42501'; end if;
  if p_driver_id is not null and not private.is_platform_privileged()
     and not private.can_access_driver(p_organization_id,p_driver_id) then raise exception 'Driver not accessible' using errcode='42501'; end if;
  if nullif(btrim(coalesce(p_site,'')),'') is not null and not private.is_platform_privileged()
     and not private.can_access_site(p_organization_id,p_site) then raise exception 'Site not accessible' using errcode='42501'; end if;
  if p_dedupe_key is not null then
    select id into v_id from public.approval_requests where organization_id=p_organization_id and dedupe_key=p_dedupe_key and status='pending' limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.approval_requests(organization_id,driver_id,site,entity_type,entity_id,request_type,title,detail,priority,status,dedupe_key,requested_by,metadata)
  values (p_organization_id,p_driver_id,nullif(upper(btrim(coalesce(p_site,''))),''),
    p_entity_type,p_entity_id,p_request_type,coalesce(nullif(btrim(p_title),''),'Approval request'),
    nullif(btrim(coalesce(p_detail,'')),''),
    case when p_priority in ('low','medium','high','critical') then p_priority else 'medium' end,
    'pending',p_dedupe_key,(select auth.uid()),coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  perform public.write_audit_event(p_organization_id,'approval_requested','approval_request',v_id::text,'Approval requested',
    p_driver_id,p_site,null,'{}'::jsonb,
    jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id,'request_type',p_request_type,'title',p_title),
    coalesce(p_metadata,'{}'::jsonb));
  return v_id;
end;
$function$;

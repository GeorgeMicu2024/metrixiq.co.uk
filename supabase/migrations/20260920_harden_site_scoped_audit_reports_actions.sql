-- Site-scope hardening for audit, reports and Action Center.

CREATE OR REPLACE FUNCTION public.claim_action_center_item(p_entity_type text, p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_site text; v_driver uuid;
begin
 if p_entity_type='manager_task' then select organization_id,site,driver_id into v_org,v_site,v_driver from public.manager_tasks where id=p_entity_id;
 elsif p_entity_type='coaching' then select c.organization_id,d.site,c.driver_id into v_org,v_site,v_driver from public.coaching_cases c left join public.drivers d on d.id=c.driver_id where c.id=p_entity_id;
 elsif p_entity_type='incident' then select organization_id,site,driver_id into v_org,v_site,v_driver from public.operational_incidents where id=p_entity_id;
 elsif p_entity_type='workflow' then select organization_id,site,driver_id into v_org,v_site,v_driver from public.workflow_instances where id=p_entity_id;
 else raise exception 'This item type cannot be claimed'; end if;
 if v_org is null then raise exception 'Action item not found'; end if;
 if not private.is_platform_privileged() and not private.has_workspace_permission(v_org,'manage_workflows') and not private.has_workspace_permission(v_org,'manage_coaching') then raise exception 'Not authorised' using errcode='42501'; end if;
 if not private.is_platform_privileged() and v_driver is not null and not private.can_access_driver(v_org,v_driver) then raise exception 'Driver not accessible' using errcode='42501'; end if;
 if not private.is_platform_privileged() and v_driver is null and v_site is not null and not private.can_access_site(v_org,v_site) then raise exception 'Site not accessible' using errcode='42501'; end if;
 if p_entity_type='manager_task' then update public.manager_tasks set assigned_to=(select auth.uid()),status='in_progress',updated_at=now() where id=p_entity_id;
 elsif p_entity_type='coaching' then update public.coaching_cases set assigned_to=(select auth.uid()),status=case when status='open' then 'assigned' else status end,updated_at=now() where id=p_entity_id;
 elsif p_entity_type='incident' then update public.operational_incidents set assigned_to=(select auth.uid()),status=case when status='open' then 'investigating' else status end,updated_at=now() where id=p_entity_id;
 else update public.workflow_instances set assigned_to=(select auth.uid()),updated_at=now() where id=p_entity_id; update public.workflow_step_runs set assigned_to=(select auth.uid()),status=case when status='open' then 'in_progress' else status end,updated_at=now() where workflow_instance_id=p_entity_id and step_order=(select current_step from public.workflow_instances where id=p_entity_id); end if;
 perform public.write_audit_event(v_org,'action_claimed',p_entity_type,p_entity_id::text,'Action Center item claimed',v_driver,v_site,null,'{}',jsonb_build_object('assigned_to',(select auth.uid())),'{}');
end $function$
;

CREATE OR REPLACE FUNCTION public.list_audit_events(p_organization_id uuid, p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, actor_id uuid, actor_email text, actor_name text, event_type text, entity_type text, entity_id text, driver_id uuid, driver_name text, trid text, site text, week_label text, action text, before_data jsonb, after_data jsonb, metadata jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.has_workspace_permission(p_organization_id,'view_audit') then raise exception 'Not authorised' using errcode='42501'; end if;
 return query select a.id,a.actor_id,p.email,p.full_name,a.event_type,a.entity_type,a.entity_id,a.driver_id,d.full_name,d.trid,coalesce(a.site,d.site),a.week_label,a.action,a.before_data,a.after_data,a.metadata,a.created_at
 from public.audit_events a left join public.profiles p on p.id=a.actor_id left join public.drivers d on d.id=a.driver_id
 where a.organization_id=p_organization_id and (private.is_platform_privileged() or (a.driver_id is not null and private.can_access_driver(a.organization_id,a.driver_id)) or (a.driver_id is null and (a.site is null or private.can_access_site(a.organization_id,a.site))))
 order by a.created_at desc limit greatest(1,least(coalesce(p_limit,500),2000));
end $function$
;

CREATE OR REPLACE FUNCTION public.list_report_snapshots(p_organization_id uuid, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, report_type text, title text, site text, week_label text, filters jsonb, sections jsonb, summary jsonb, payload jsonb, created_by uuid, created_by_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.has_workspace_permission(p_organization_id,'view_reports') and not private.is_platform_privileged() then raise exception 'Not authorised' using errcode='42501'; end if;
 return query select r.id,r.report_type,r.title,r.site,r.week_label,r.filters,r.sections,r.summary,r.payload,r.created_by,p.full_name,r.created_at from public.report_snapshots r left join public.profiles p on p.id=r.created_by
 where r.organization_id=p_organization_id and (private.is_platform_privileged() or r.site is null or private.can_access_site(r.organization_id,r.site))
 order by r.created_at desc limit greatest(1,least(coalesce(p_limit,200),1000));
end $function$
;

CREATE OR REPLACE FUNCTION public.list_workspace_audit_events(p_organization_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, event_type text, entity_type text, entity_id text, action text, metadata jsonb, created_at timestamp with time zone, actor_id uuid, actor_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.has_workspace_permission(p_organization_id,'view_audit') and not private.has_workspace_permission(p_organization_id,'manage_team') then raise exception 'Audit access required' using errcode='42501'; end if;
 return query select a.id,a.event_type,a.entity_type,a.entity_id,a.action,a.metadata,a.created_at,a.actor_id,p.full_name from public.audit_events a left join public.profiles p on p.id=a.actor_id
 where a.organization_id=p_organization_id and (private.is_platform_privileged() or (a.driver_id is not null and private.can_access_driver(a.organization_id,a.driver_id)) or (a.driver_id is null and (a.site is null or private.can_access_site(a.organization_id,a.site))))
 order by a.created_at desc limit greatest(1,least(coalesce(p_limit,50),200));
end $function$
;

CREATE OR REPLACE FUNCTION public.save_report_snapshot(p_organization_id uuid, p_report_type text, p_title text, p_site text DEFAULT NULL::text, p_week_label text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb, p_sections jsonb DEFAULT '[]'::jsonb, p_summary jsonb DEFAULT '{}'::jsonb, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_site text:=nullif(upper(btrim(coalesce(p_site,''))),'');
begin
 if not private.has_workspace_permission(p_organization_id,'view_reports') and not private.is_platform_privileged() then raise exception 'Not authorised' using errcode='42501'; end if;
 if not private.is_platform_privileged() and v_site is not null and not private.can_access_site(p_organization_id,v_site) then raise exception 'Site not accessible' using errcode='42501'; end if;
 if length(btrim(coalesce(p_title,'')))<1 then raise exception 'Report title is required'; end if;
 insert into public.report_snapshots(organization_id,report_type,title,site,week_label,filters,sections,summary,payload,created_by) values(p_organization_id,coalesce(nullif(btrim(p_report_type),''),'management_report'),btrim(p_title),v_site,nullif(btrim(coalesce(p_week_label,'')),''),coalesce(p_filters,'{}'),coalesce(p_sections,'[]'),coalesce(p_summary,'{}'),coalesce(p_payload,'{}'),(select auth.uid())) returning id into v_id;
 perform public.write_audit_event(p_organization_id,'report_generated','report_snapshot',v_id::text,'Management report snapshot generated',null,v_site,p_week_label,'{}',jsonb_build_object('report_type',p_report_type,'title',p_title,'site',v_site,'week_label',p_week_label),jsonb_build_object('sections',coalesce(p_sections,'[]')));
 return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.write_audit_event(p_organization_id uuid, p_event_type text, p_entity_type text, p_entity_id text, p_action text, p_driver_id uuid DEFAULT NULL::uuid, p_site text DEFAULT NULL::text, p_week_label text DEFAULT NULL::text, p_before_data jsonb DEFAULT '{}'::jsonb, p_after_data jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 if not private.is_platform_privileged() and not exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=(select auth.uid())) then raise exception 'Not authorised' using errcode='42501'; end if;
 if not private.is_platform_privileged() and p_driver_id is not null and not private.can_access_driver(p_organization_id,p_driver_id) then raise exception 'Driver not accessible' using errcode='42501'; end if;
 if not private.is_platform_privileged() and p_site is not null and not private.can_access_site(p_organization_id,p_site) then raise exception 'Site not accessible' using errcode='42501'; end if;
 insert into public.audit_events(organization_id,actor_id,event_type,entity_type,entity_id,driver_id,site,week_label,action,before_data,after_data,metadata)
 values(p_organization_id,(select auth.uid()),p_event_type,p_entity_type,p_entity_id,p_driver_id,p_site,p_week_label,p_action,coalesce(p_before_data,'{}'),coalesce(p_after_data,'{}'),coalesce(p_metadata,'{}')) returning id into v_id;
 return v_id;
end $function$
;

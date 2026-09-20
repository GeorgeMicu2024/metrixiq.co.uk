-- AI intervention task RPC. SECURITY DEFINER is intentional and guarded by auth, workspace permission and site/driver scope.
create or replace function public.create_ai_intervention_task(p_organization_id uuid,p_driver_id uuid,p_site text,p_signal_key text,p_title text,p_detail text,p_priority text default 'medium',p_due_hours integer default 24,p_metadata jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_site text:=nullif(upper(btrim(coalesce(p_site,''))),''); v_key text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not private.is_platform_privileged() and not private.has_workspace_permission(p_organization_id,'manage_coaching') and not private.has_workspace_permission(p_organization_id,'manage_workflows') then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_driver_id is not null and not private.is_platform_privileged() and not private.can_access_driver(p_organization_id,p_driver_id) then raise exception 'Driver not accessible' using errcode='42501'; end if;
 if v_site is not null and not private.is_platform_privileged() and not private.can_access_site(p_organization_id,v_site) then raise exception 'Site not accessible' using errcode='42501'; end if;
 if coalesce(btrim(p_signal_key),'')='' or coalesce(btrim(p_title),'')='' then raise exception 'Signal key and title are required'; end if;
 v_key='ai:'||p_signal_key||':'||coalesce(p_driver_id::text,'workspace')||':'||to_char(current_date,'IYYY-IW');
 insert into public.manager_tasks(organization_id,driver_id,site,source_type,source_id,dedupe_key,title,detail,priority,status,due_at,metadata,created_by)
 values(p_organization_id,p_driver_id,v_site,'ai_intervention',p_signal_key,v_key,btrim(p_title),nullif(btrim(coalesce(p_detail,'')),''),case when p_priority in ('critical','high','medium','low') then p_priority else 'medium' end,'open',now()+make_interval(hours=>greatest(1,least(coalesce(p_due_hours,24),168))),coalesce(p_metadata,'{}')||jsonb_build_object('ai_generated',true,'human_review_required',true,'signal_key',p_signal_key),(select auth.uid()))
 on conflict(organization_id,dedupe_key) do update set detail=excluded.detail,priority=excluded.priority,due_at=greatest(public.manager_tasks.due_at,excluded.due_at),metadata=public.manager_tasks.metadata||excluded.metadata,updated_at=now()
 returning id into v_id;
 perform public.write_audit_event(p_organization_id,'ai_intervention_created','manager_task',v_id::text,'AI intervention task created',p_driver_id,v_site,null,'{}',jsonb_build_object('signal_key',p_signal_key,'priority',p_priority),jsonb_build_object('human_review_required',true));
 return v_id;
end $$;
revoke all on function public.create_ai_intervention_task(uuid,uuid,text,text,text,text,text,integer,jsonb) from public,anon;
grant execute on function public.create_ai_intervention_task(uuid,uuid,text,text,text,text,text,integer,jsonb) to authenticated,service_role;

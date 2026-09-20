-- eMentor Driver Mapping V2: controlled classification for unmatched source rows.
create or replace function public.classify_mentor_unmatched_record(p_organization_id uuid,p_record_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_site text;
begin
 if p_status not in ('open','hidden','transporter') then raise exception 'Invalid eMentor row status'; end if;
 select site into v_site from public.unmatched_driver_records where id=p_record_id and organization_id=p_organization_id;
 if not found then raise exception 'Unmatched record was not found in this workspace'; end if;
 if not private.is_platform_privileged() and (
   not private.has_org_role(p_organization_id,array['owner','admin','manager'])
   or not private.can_access_site(p_organization_id,v_site)
 ) then raise exception 'Not authorised to classify imported records' using errcode='42501'; end if;
 update public.unmatched_driver_records
 set status=p_status,
     matched_driver_id=case when p_status='open' then null else matched_driver_id end,
     resolved_at=case when p_status='open' then null else now() end
 where id=p_record_id and organization_id=p_organization_id;
 return jsonb_build_object('record_id',p_record_id,'status',p_status);
end;
$function$;
revoke all on function public.classify_mentor_unmatched_record(uuid,uuid,text) from public,anon;
grant execute on function public.classify_mentor_unmatched_record(uuid,uuid,text) to authenticated;

-- Remember the stable eMentor identity key chosen during manual driver mapping.
create or replace function public.resolve_mentor_unmatched_record(p_organization_id uuid,p_record_id uuid,p_driver_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_row public.unmatched_driver_records%rowtype;
  v_driver public.drivers%rowtype;
  v_report_date date;
  v_score numeric;
  v_source_key text;
  v_mentor_key text;
  v_name text;
begin
 select * into v_row from public.unmatched_driver_records where id=p_record_id and organization_id=p_organization_id and report_type='mentor_daily';
 if not found then raise exception 'eMentor unmatched record was not found in this workspace'; end if;
 select * into v_driver from public.drivers where id=p_driver_id and organization_id=p_organization_id;
 if not found then raise exception 'Target driver was not found in this workspace'; end if;
 if not private.is_platform_privileged() and (not private.has_org_role(p_organization_id,array['owner','admin','manager']) or not private.can_access_site(p_organization_id,v_row.site) or not private.can_access_driver(p_organization_id,p_driver_id)) then raise exception 'Not authorised to resolve eMentor records' using errcode='42501'; end if;

 v_report_date:=nullif(v_row.payload->>'reportDate','')::date;
 v_score:=nullif(v_row.payload->>'score','')::numeric;
 if v_report_date is null then raise exception 'eMentor source row has no report date'; end if;

 v_mentor_key:=coalesce(
   nullif(v_row.payload->'driver'->>'mentorHash',''),
   nullif(v_row.payload->'driver'->'details'->'mentor'->>'identityKey','')
 );
 v_source_key:=coalesce(v_mentor_key,nullif(v_row.raw_trid,''),p_driver_id::text);
 v_name:=regexp_replace(btrim(coalesce(v_row.raw_name,'')),'\s+',' ','g');

 if v_name<>'' and nullif(v_row.normalized_name,'') is not null then
  insert into public.driver_aliases(organization_id,driver_id,alias_type,alias_value,alias_normalized,confidence,source)
  values(p_organization_id,p_driver_id,'name',v_name,v_row.normalized_name,1,'manual eMentor mapping')
  on conflict(organization_id,alias_type,alias_normalized) do update
    set driver_id=excluded.driver_id,alias_value=excluded.alias_value,confidence=1,source=excluded.source;
 end if;

 if v_mentor_key is not null then
  insert into public.driver_aliases(organization_id,driver_id,alias_type,alias_value,alias_normalized,confidence,source)
  values(p_organization_id,p_driver_id,'mentor_hash',v_mentor_key,v_mentor_key,1,'manual eMentor mapping')
  on conflict(organization_id,alias_type,alias_normalized) do update
    set driver_id=excluded.driver_id,alias_value=excluded.alias_value,confidence=1,source=excluded.source;
 end if;

 insert into public.mentor_daily_snapshots(organization_id,driver_id,source_import_id,source_identity_key,report_date,week_label,mentor_score,raw_data)
 values(p_organization_id,p_driver_id,v_row.source_import_id,v_source_key,v_report_date,coalesce(v_row.week_label,'Unknown'),v_score,jsonb_build_object('mentor',v_row.payload->'driver'->'details'->'mentor','source_files',coalesce(v_row.payload->'driver'->'sources','[]'::jsonb),'report_date',v_report_date,'import_mode','daily','manual_mapping',true))
 on conflict(organization_id,report_date,source_identity_key) do update
   set driver_id=excluded.driver_id,source_import_id=excluded.source_import_id,week_label=excluded.week_label,mentor_score=excluded.mentor_score,raw_data=excluded.raw_data;

 update public.unmatched_driver_records
 set status='resolved',matched_driver_id=p_driver_id,resolved_at=now()
 where id=p_record_id and organization_id=p_organization_id;

 return jsonb_build_object('record_id',p_record_id,'driver_id',p_driver_id,'report_date',v_report_date,'materialized',true);
end;
$function$;

revoke all on function public.resolve_mentor_unmatched_record(uuid,uuid,uuid) from public,anon;
grant execute on function public.resolve_mentor_unmatched_record(uuid,uuid,uuid) to authenticated;

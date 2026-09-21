alter table public.mentor_daily_snapshots
  add column if not exists is_hidden boolean not null default false;

create index if not exists mentor_daily_visible_idx
  on public.mentor_daily_snapshots (organization_id, report_date desc, is_hidden);

create or replace function public.set_mentor_daily_visibility(
  p_organization_id uuid,
  p_snapshot_id uuid,
  p_hidden boolean
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.mentor_daily_snapshots%rowtype;
begin
  select * into v_row from public.mentor_daily_snapshots
  where id=p_snapshot_id and organization_id=p_organization_id;
  if not found then raise exception 'eMentor snapshot was not found in this workspace'; end if;
  if not private.is_platform_privileged()
     and (not private.has_org_role(p_organization_id,array['owner','admin','manager'])
          or not private.can_access_driver(p_organization_id,v_row.driver_id))
  then raise exception 'Not authorised to change eMentor visibility' using errcode='42501'; end if;
  update public.mentor_daily_snapshots set is_hidden=p_hidden
  where id=p_snapshot_id and organization_id=p_organization_id;
  return jsonb_build_object('snapshot_id',p_snapshot_id,'hidden',p_hidden);
end;
$function$;

revoke all on function public.set_mentor_daily_visibility(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_mentor_daily_visibility(uuid,uuid,boolean) to authenticated;
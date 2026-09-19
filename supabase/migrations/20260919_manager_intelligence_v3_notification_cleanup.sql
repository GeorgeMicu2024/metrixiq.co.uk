-- Manager Intelligence V3 notification lifecycle cleanup.
-- Keeps the Action Feed historical but removes resolved/stale items from the active queue.

create or replace function public.cleanup_stale_notification_events(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count integer := 0;
  v_changed integer := 0;
begin
  if not public.is_workspace_member(p_organization_id)
     and not private.is_platform_privileged() then
    raise exception 'Not authorised' using errcode='42501';
  end if;

  -- Performance alerts are no longer actionable after the underlying alert resolves/disappears.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='performance_alert'
    and n.status not in ('reviewed','dismissed')
    and not exists (
      select 1
      from public.performance_alerts a
      where a.organization_id=n.organization_id
        and a.id::text=n.source_id
        and a.status<>'resolved'
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  -- Closed coaching cases remain in history but leave the active notification feed.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='coaching_case'
    and n.status not in ('reviewed','dismissed')
    and not exists (
      select 1
      from public.coaching_cases c
      where c.organization_id=n.organization_id
        and c.id::text=n.source_id
        and c.status<>'closed'
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  -- Identity notifications clear automatically when there is no matching open unmatched evidence.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='unmatched'
    and n.status not in ('reviewed','dismissed')
    and not exists (
      select 1
      from public.unmatched_driver_records u
      where u.organization_id=n.organization_id
        and u.status='open'
        and coalesce(u.site,'workspace')=coalesce(n.source_id,'workspace')
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  -- Rolled-back imports no longer require an active import notification.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='import'
    and n.status not in ('reviewed','dismissed')
    and exists (
      select 1
      from public.imports i
      where i.organization_id=n.organization_id
        and i.id::text=n.source_id
        and coalesce((i.metadata->>'rolled_back')::boolean,false)=true
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  -- Driver metric alerts are week-specific. Once a newer stored period exists they become history.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='driver_metric'
    and n.driver_id is not null
    and n.status not in ('reviewed','dismissed')
    and nullif(n.metadata->>'week_label','') is not null
    and exists (
      select 1
      from public.driver_metrics newer
      join public.driver_metrics current_period
        on current_period.organization_id=n.organization_id
       and current_period.driver_id=n.driver_id
       and current_period.week_label=n.metadata->>'week_label'
      where newer.organization_id=n.organization_id
        and newer.driver_id=n.driver_id
        and coalesce(newer.period_end,newer.period_start) >
            coalesce(current_period.period_end,current_period.period_start)
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  -- Site-score drops become historical after a newer site scorecard is stored.
  update public.notification_events n
  set status='reviewed',
      read_at=coalesce(n.read_at,now()),
      reviewed_at=coalesce(n.reviewed_at,now()),
      updated_at=now()
  where n.organization_id=p_organization_id
    and n.source_type='site_scorecard'
    and n.site is not null
    and n.status not in ('reviewed','dismissed')
    and nullif(n.metadata->>'current_week','') is not null
    and exists (
      select 1
      from public.site_scorecards newer
      join public.site_scorecards current_card
        on current_card.organization_id=n.organization_id
       and current_card.site=n.site
       and current_card.week_label=n.metadata->>'current_week'
      where newer.organization_id=n.organization_id
        and newer.site=n.site
        and (newer.year*100+newer.week) > (current_card.year*100+current_card.week)
    );
  get diagnostics v_changed=row_count;
  v_count:=v_count+v_changed;

  return v_count;
end;
$$;

grant execute on function public.cleanup_stale_notification_events(uuid) to authenticated;

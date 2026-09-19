-- SECURITY DEFINER execution hardening.
-- Keep the pre-auth invite lookup public; all other privileged RPCs must require a signed-in user
-- or service_role according to their own authorization checks.
do $$
declare r record;
begin
  for r in
    select p.oid,p.oid::regprocedure as sig,p.proname,pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute')
  loop
    if r.proname='get_team_invite_signup_context' then continue; end if;
    execute format('revoke execute on function %s from public, anon',r.sig);
    if r.def ilike '%service_role%' then
      execute format('revoke execute on function %s from authenticated',r.sig);
      execute format('grant execute on function %s to service_role',r.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role',r.sig);
    end if;
  end loop;
end $$;
grant execute on function public.get_team_invite_signup_context(uuid,text) to anon, authenticated;

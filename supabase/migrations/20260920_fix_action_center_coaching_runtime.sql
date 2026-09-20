-- Restore authenticated Action Center access and qualify coaching case id to avoid PL/pgSQL ambiguity.
grant execute on function public.list_action_center_v2(uuid,text,integer) to authenticated;
-- evaluate_coaching_case_improvement live definition updated to use cc.id in coaching_cases lookup.

-- Keep invite signup context server-side only.
-- The register-invite API uses the service role after validating the invite token/email.
revoke all on function public.get_team_invite_signup_context(uuid,text) from public;
revoke all on function public.get_team_invite_signup_context(uuid,text) from anon;
revoke all on function public.get_team_invite_signup_context(uuid,text) from authenticated;
grant execute on function public.get_team_invite_signup_context(uuid,text) to service_role;

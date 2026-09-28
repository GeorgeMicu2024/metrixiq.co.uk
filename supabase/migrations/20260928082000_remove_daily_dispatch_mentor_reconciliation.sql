-- eMentor No Trip Recorder is sourced from eMentor trip evidence only.
-- Remove the temporary Daily Dispatch reconciliation objects.

drop function if exists public.replace_daily_dispatch_assignments(uuid,text,date,jsonb,text,text);
drop table if exists public.daily_dispatch_assignments;

-- Preserve operational and audit history when an Auth user is deleted.
-- imports.uploaded_by is nullable, so detach it automatically.
-- organizations.created_by and reports.created_by are immutable audit UUIDs; keep
-- the UUID values after the Auth row is removed instead of blocking deletion.

alter table public.imports
  drop constraint if exists imports_uploaded_by_fkey;
alter table public.imports
  add constraint imports_uploaded_by_fkey
  foreign key (uploaded_by) references auth.users(id) on delete set null;

alter table public.organizations
  drop constraint if exists organizations_created_by_fkey;

alter table public.reports
  drop constraint if exists reports_created_by_fkey;

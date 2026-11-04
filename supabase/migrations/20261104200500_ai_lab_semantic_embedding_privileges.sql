-- Supabase's default authenticated table ACL may include unrestricted UPDATE.
-- Narrow it to the AI Lab-only embedding column. Existing approved lesson text
-- and station scope remain immutable after approval.
revoke update on public.ai_lab_learning_notes from authenticated;
grant update (embedding) on public.ai_lab_learning_notes to authenticated;

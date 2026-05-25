-- Prepared migration for Package 45: 18+ document access hardening and retention metadata.
-- Review and apply manually in Supabase. Do not run automatically from Codex.
-- This migration does not delete files and does not create retention automation.

alter table public.age_verification_requests
  add column if not exists document_retention_until timestamptz,
  add column if not exists document_delete_requested_at timestamptz,
  add column if not exists document_deleted_at timestamptz;

drop policy if exists "Users can read own age verification files"
  on storage.objects;

drop policy if exists "Admins can read age verification files"
  on storage.objects;

create policy "Admins can read age verification files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'age-verifications'
    and public.is_admin()
  );

comment on column public.age_verification_requests.document_retention_until is
  'Future retention deadline for uploaded age verification documents. Files are not deleted automatically by this migration.';

comment on column public.age_verification_requests.document_delete_requested_at is
  'Timestamp when age verification document deletion was requested or scheduled. Files are not deleted automatically by this migration.';

comment on column public.age_verification_requests.document_deleted_at is
  'Timestamp when age verification documents were actually removed from storage, once a separate audited deletion process exists.';

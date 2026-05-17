-- Prepared migration for private document/selfie paths in 18+ verification requests.
-- Review and apply manually in Supabase. Do not run automatically from Codex.
-- Storage bucket required: age-verifications, private.

alter table public.age_verification_requests
  add column if not exists document_front_path text,
  add column if not exists document_back_path text,
  add column if not exists selfie_path text,
  add column if not exists submitted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists document_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'age_verification_requests_document_type_check'
      and conrelid = 'public.age_verification_requests'::regclass
  ) then
    alter table public.age_verification_requests
      add constraint age_verification_requests_document_type_check
      check (document_type is null or document_type in ('rg', 'cnh', 'passport', 'other'));
  end if;
end $$;

drop policy if exists "Users can update own pending age verification documents"
  on public.age_verification_requests;

create policy "Users can update own pending age verification documents"
  on public.age_verification_requests
  for update
  to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Users can upload own age verification files"
  on storage.objects;

create policy "Users can upload own age verification files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'age-verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can read own age verification files"
  on storage.objects;

create policy "Users can read own age verification files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'age-verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own age verification files"
  on storage.objects;

create policy "Users can update own age verification files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'age-verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'age-verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

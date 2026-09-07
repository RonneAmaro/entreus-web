-- Harden 18+ age verification submission on EntreUS DEV.
-- Idempotent, additive hardening. Review and apply manually. No remote mutation
-- is performed by this repository automatically.
--
-- Goals:
--   * Minors can NEVER create a valid request or upload/finalize documents,
--     even by calling the backend directly (auth.uid() + profiles.birth_date
--     are the only sources of truth; client-supplied user_id is ignored).
--   * Users can no longer INSERT/UPDATE age_verification_requests directly;
--     submission happens through SECURITY DEFINER RPCs that validate
--     everything server-side.
--   * Storage age-verifications stays PRIVATE. User read of documents is NOT
--     reopened (admin read stays as-is). Upload INSERT requires adult + own
--     pending, not-yet-submitted request and exact <uid>/<request-id>/ path.
--   * The pre-existing weak UPDATE policy on objects (foldername[1] = uid) is
--     removed: uploads use unique paths with upsert: false, so no UPDATE is
--     needed.

-- ============ RPC: create_age_verification_request ============

create or replace function public.create_age_verification_request()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_birth_date date;
  v_existing record;
  v_new_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select p.birth_date into v_birth_date
  from public.profiles p
  where p.id = v_uid;

  if v_birth_date is null then
    raise exception 'BIRTH_DATE_REQUIRED';
  end if;

  if v_birth_date > (current_date - interval '18 years') then
    raise exception 'MINOR_NOT_ALLOWED';
  end if;

  -- Reuse a pending incomplete request; never stack concurrent pendings.
  select r.id, r.submitted_at into v_existing
  from public.age_verification_requests r
  where r.user_id = v_uid and r.status = 'pending'
  order by r.created_at desc
  limit 1;

  if found then
    if v_existing.submitted_at is not null then
      raise exception 'REQUEST_ALREADY_SUBMITTED';
    end if;
    return v_existing.id;
  end if;

  insert into public.age_verification_requests (user_id, status, birth_date)
  values (v_uid, 'pending', v_birth_date)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ============ RPC: finalize_age_verification_request ============

create or replace function public.finalize_age_verification_request(
  p_request_id uuid,
  p_document_type text,
  p_document_front_path text,
  p_document_back_path text,
  p_selfie_path text,
  p_user_statement text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_birth_date date;
  v_request record;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select p.birth_date into v_birth_date
  from public.profiles p
  where p.id = v_uid;

  if v_birth_date is null or v_birth_date > (current_date - interval '18 years') then
    raise exception 'MINOR_NOT_ALLOWED';
  end if;

  select * into v_request
  from public.age_verification_requests r
  where r.id = p_request_id and r.user_id = v_uid;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  if p_document_type not in ('rg', 'cnh', 'passport', 'other') then
    raise exception 'INVALID_DOCUMENT_TYPE';
  end if;

  if p_document_front_path is null or p_selfie_path is null then
    raise exception 'DOCUMENTS_REQUIRED';
  end if;

  -- Paths must live inside <uid>/<request-id>/ — client paths are never trusted.
  if not public.age_verification_path_owned(p_document_front_path, v_uid, p_request_id)
     or not public.age_verification_path_owned(p_selfie_path, v_uid, p_request_id)
     or (p_document_back_path is not null and not public.age_verification_path_owned(p_document_back_path, v_uid, p_request_id)) then
    raise exception 'INVALID_DOCUMENT_PATH';
  end if;

  -- Objects must actually exist in the private bucket under the validated prefix.
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'age-verifications' and o.name = p_document_front_path
  ) or not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'age-verifications' and o.name = p_selfie_path
  ) or (p_document_back_path is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'age-verifications' and o.name = p_document_back_path
  )) then
    raise exception 'DOCUMENTS_NOT_UPLOADED';
  end if;

  update public.age_verification_requests r
  set document_type = p_document_type,
      document_front_path = p_document_front_path,
      document_back_path = p_document_back_path,
      selfie_path = p_selfie_path,
      user_statement = nullif(trim(p_user_statement), ''),
      privacy_accepted_at = now(),
      submitted_at = now(),
      status = 'pending'
  where r.id = p_request_id and r.user_id = v_uid;

  update public.profiles p
  set wants_18_plus = true,
      age_verification_status = 'pending',
      show_sensitive_content = false
  where p.id = v_uid;
end;
$$;

-- Path ownership helper (stable, read-only).
create or replace function public.age_verification_path_owned(
  p_path text,
  p_uid uuid,
  p_request_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_path like (p_uid::text || '/' || p_request_id::text || '/%')
    and p_path <> (p_uid::text || '/' || p_request_id::text || '/');
$$;

-- ============ Grants: authenticated only, never anon ============

revoke all on function public.create_age_verification_request() from public, anon;
revoke all on function public.finalize_age_verification_request(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.age_verification_path_owned(text, uuid, uuid) from public, anon;
grant execute on function public.create_age_verification_request() to authenticated;
grant execute on function public.finalize_age_verification_request(uuid, text, text, text, text, text) to authenticated;

-- ============ age_verification_requests policies ============

-- Direct user UPDATE removed: submission goes through finalize RPC.
drop policy if exists "Users can update own pending age verification documents"
  on public.age_verification_requests;

-- Direct user INSERT removed: request creation goes through create RPC.
drop policy if exists "Users can insert own age verification requests"
  on public.age_verification_requests;

drop policy if exists "Users can create own age verification requests"
  on public.age_verification_requests;

drop policy if exists "Users can delete own age verification requests"
  on public.age_verification_requests;

-- ============ Storage policies (bucket stays PRIVATE) ============

-- Weak folder-only UPDATE policy removed (upsert: false; unique paths).
drop policy if exists "Users can update own age verification files"
  on storage.objects;

-- Weak INSERT (first folder = uid only) replaced with full validation.
drop policy if exists "Users can upload own age verification files"
  on storage.objects;

create policy "Users can upload own pending age verification files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'age-verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.age_verification_requests r
      join public.profiles p on p.id = r.user_id
      where r.user_id = auth.uid()
        and r.status = 'pending'
        and r.submitted_at is null
        and (storage.foldername(name))[2] = r.id::text
        and p.birth_date is not null
        and p.birth_date <= (current_date - interval '18 years')
    )
  );

-- Restricted cleanup of failed partial uploads from the SAME attempt:
-- own user, own request folder, request still pending and NOT submitted.
-- Never deletes files from a previously submitted request.
drop policy if exists "Users can cleanup own incomplete age verification files"
  on storage.objects;

create policy "Users can cleanup own incomplete age verification files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'age-verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.age_verification_requests r
      where r.user_id = auth.uid()
        and r.status = 'pending'
        and r.submitted_at is null
        and (storage.foldername(name))[2] = r.id::text
    )
  );

-- NOTE: user SELECT on age-verifications stays CLOSED (no policy re-added).
-- Admin read/update policies from 20260517_add_admin_age_verification_review
-- remain untouched.

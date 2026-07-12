-- Review and apply manually. Profile identity media moderation for adult/mixed profiles.
create table if not exists public.profile_media_submissions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check (media_type in ('avatar', 'banner')), storage_provider text not null default 'r2' check (storage_provider = 'r2'),
  storage_key text not null unique, approved_storage_key text null, content_type text null,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'change_requested', 'cancelled')),
  moderation_category text null check (moderation_category is null or moderation_category in ('safe', 'review', 'prohibited')),
  moderation_reason text null, submitted_at timestamptz not null default now(), reviewed_at timestamptz null,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  replaced_submission_id uuid null references public.profile_media_submissions(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (storage_key <> '' and storage_key not like '%..%' and storage_key not like E'%\\%'),
  check (approved_storage_key is null or (approved_storage_key like 'profile-media/public/%' and approved_storage_key not like '%..%' and approved_storage_key not like E'%\\%'))
);
create table if not exists public.profile_media_copy_orphans (
  id uuid primary key default gen_random_uuid(), submission_id uuid null references public.profile_media_submissions(id) on delete set null,
  storage_provider text not null default 'r2' check (storage_provider = 'r2'), storage_key text not null unique,
  created_at timestamptz not null default now(), cleaned_at timestamptz null,
  check (storage_key like 'profile-media/public/%' and storage_key <> '' and storage_key not like '%..%' and storage_key not like E'%\\%')
);
alter table public.profile_media_submissions add column if not exists approved_storage_key text null;
alter table public.profile_media_copy_orphans alter column submission_id drop not null;
alter table public.profile_media_copy_orphans drop constraint if exists profile_media_copy_orphans_submission_id_fkey;
alter table public.profile_media_copy_orphans add constraint profile_media_copy_orphans_submission_id_fkey
  foreign key (submission_id) references public.profile_media_submissions(id) on delete set null;
create index if not exists profile_media_submissions_user_date_idx on public.profile_media_submissions(user_id, submitted_at desc);
create index if not exists profile_media_submissions_status_date_idx on public.profile_media_submissions(status, submitted_at asc);
create unique index if not exists profile_media_one_pending_per_type_idx on public.profile_media_submissions(user_id, media_type) where status = 'pending_review';
alter table public.profile_media_submissions enable row level security;
alter table public.profile_media_copy_orphans enable row level security;
drop policy if exists "Users read own profile media submissions" on public.profile_media_submissions;
-- No direct SELECT policy either: owners read sanitized status through the server API, never storage keys.
drop policy if exists "Users create own pending profile media submissions" on public.profile_media_submissions;
-- No authenticated INSERT policy: submissions are created only by the authenticated server Route Handler using service_role.
drop policy if exists "Admins manage profile media submissions" on public.profile_media_submissions;
drop policy if exists "Admins manage profile media copy orphans" on public.profile_media_copy_orphans;
-- No authenticated table policies: all reads and writes use authenticated server Route Handlers plus service_role.

create or replace function public.create_profile_media_submission(
  authenticated_user_id uuid, requested_media_type text, requested_storage_key text, verified_content_type text
) returns table (id uuid, media_type text, status text, submitted_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare expected_prefix text;
begin
  if authenticated_user_id is null or not exists (
    select 1 from public.profiles p where p.id = authenticated_user_id and p.profile_content_mode in ('adult', 'mixed')
  ) then raise exception 'Profile is not eligible for media review'; end if;
  if requested_media_type not in ('avatar', 'banner') then raise exception 'Invalid media type'; end if;
  if verified_content_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'Invalid content type'; end if;
  expected_prefix := 'protected/profile-media/' || authenticated_user_id::text || '/';
  if nullif(requested_storage_key, '') is null or requested_storage_key not like (expected_prefix || '%')
    or requested_storage_key like '%..%' or requested_storage_key like E'%\\%' then raise exception 'Invalid storage key'; end if;

  -- Serialize the user/type pair even when no prior row exists. Any later INSERT failure rolls this whole transaction back,
  -- preserving the previous pending row and ensuring concurrent requests cannot leave two pending submissions.
  perform pg_advisory_xact_lock(hashtextextended(authenticated_user_id::text || ':' || requested_media_type, 0));
  perform 1 from public.profile_media_submissions s
    where s.user_id = authenticated_user_id and s.media_type = requested_media_type and s.status = 'pending_review'
    for update;
  update public.profile_media_submissions s set status = 'cancelled', updated_at = now()
    where s.user_id = authenticated_user_id and s.media_type = requested_media_type and s.status = 'pending_review';
  return query insert into public.profile_media_submissions (user_id, media_type, storage_provider, storage_key, content_type, status, submitted_at, created_at, updated_at)
    values (authenticated_user_id, requested_media_type, 'r2', requested_storage_key, verified_content_type, 'pending_review', now(), now(), now())
    returning profile_media_submissions.id, profile_media_submissions.media_type, profile_media_submissions.status, profile_media_submissions.submitted_at;
end $$;
revoke all on function public.create_profile_media_submission(uuid,text,text,text) from public, authenticated;
grant execute on function public.create_profile_media_submission(uuid,text,text,text) to service_role;

create or replace function public.review_profile_media_submission(
  submission_id uuid, decision text, reviewer_id uuid, approved_public_url text default null,
  approved_public_storage_key text default null, reason text default null, category text default null
) returns table (id uuid, user_id uuid, media_type text, status text, moderation_category text, moderation_reason text, submitted_at timestamptz, reviewed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare item public.profile_media_submissions;
begin
  -- lib/admin.ts authorizes exactly role = 'admin'; keep this predicate identical.
  if not exists (select 1 from public.profiles p where p.id = reviewer_id and p.role = 'admin') then raise exception 'Not authorized'; end if;
  if decision not in ('approved', 'rejected', 'change_requested') then raise exception 'Invalid decision'; end if;
  if category is null or category not in ('safe', 'review', 'prohibited') then raise exception 'Invalid moderation category'; end if;
  if decision = 'approved' and category <> 'safe' then raise exception 'Approval requires safe category'; end if;
  if decision in ('rejected', 'change_requested') and nullif(trim(reason), '') is null then raise exception 'Reason required'; end if;
  select * into item from public.profile_media_submissions s where s.id = submission_id for update;
  if item.id is null or item.status <> 'pending_review' then raise exception 'Submission is not pending'; end if;
  if decision = 'approved' then
    if nullif(trim(approved_public_url), '') is null or approved_public_url !~ '^https://[^[:space:]]+$'
      or approved_public_url like '%..%' or approved_public_url like E'%\\%' then raise exception 'Valid approved public URL required'; end if;
    if approved_public_storage_key not like ('profile-media/public/' || item.user_id::text || '/%') or approved_public_storage_key like '%..%' or approved_public_storage_key like E'%\\%' then raise exception 'Invalid approved storage key'; end if;
    if right(approved_public_url, length(approved_public_storage_key)) <> approved_public_storage_key then raise exception 'Approved URL and key do not match'; end if;
    if item.media_type = 'avatar' then update public.profiles set avatar_url = approved_public_url, updated_at = now() where profiles.id = item.user_id;
    else update public.profiles set banner_url = approved_public_url, updated_at = now() where profiles.id = item.user_id; end if;
  end if;
  return query update public.profile_media_submissions s set status = decision,
    approved_storage_key = case when decision = 'approved' then approved_public_storage_key else null end,
    moderation_reason = nullif(trim(reason), ''), moderation_category = category, reviewed_at = now(), reviewed_by = reviewer_id, updated_at = now()
    where s.id = item.id returning s.id, s.user_id, s.media_type, s.status, s.moderation_category, s.moderation_reason, s.submitted_at, s.reviewed_at;
end $$;
revoke all on function public.review_profile_media_submission(uuid,text,uuid,text,text,text,text) from public, authenticated;
grant execute on function public.review_profile_media_submission(uuid,text,uuid,text,text,text,text) to service_role;
comment on table public.profile_media_submissions is 'Private R2 avatar/banner review queue. Private objects are copied to a distinct public key only after approval.';
comment on table public.profile_media_copy_orphans is 'Approved public copies whose transactional review failed; retained for audited cleanup.';

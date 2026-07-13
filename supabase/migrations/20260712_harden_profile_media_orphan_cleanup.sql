-- Review and apply manually. Safe claim/finalization workflow for profile media public-copy orphans.
alter table public.profile_media_copy_orphans
  add column if not exists status text not null default 'pending',
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz null,
  add column if not exists next_attempt_at timestamptz null,
  add column if not exists last_error_code text null,
  add column if not exists claimed_at timestamptz null,
  add column if not exists claimed_by text null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists verified_absent_at timestamptz null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profile_media_copy_orphans drop constraint if exists profile_media_copy_orphans_status_check;
alter table public.profile_media_copy_orphans add constraint profile_media_copy_orphans_status_check
  check (status in ('pending', 'processing', 'retry', 'deleted', 'not_found', 'protected', 'failed', 'cancelled'));
alter table public.profile_media_copy_orphans drop constraint if exists profile_media_copy_orphans_attempt_count_check;
alter table public.profile_media_copy_orphans add constraint profile_media_copy_orphans_attempt_count_check
  check (attempt_count between 0 and 5);
alter table public.profile_media_copy_orphans drop constraint if exists profile_media_copy_orphans_claim_check;
alter table public.profile_media_copy_orphans add constraint profile_media_copy_orphans_claim_check
  check ((status = 'processing' and claimed_at is not null and claimed_by is not null)
    or (status <> 'processing' and claimed_at is null and claimed_by is null));
alter table public.profile_media_copy_orphans drop constraint if exists profile_media_copy_orphans_strict_storage_key_check;
alter table public.profile_media_copy_orphans add constraint profile_media_copy_orphans_strict_storage_key_check
  check (storage_key ~ '^profile-media/public/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and storage_key not like '%..%' and storage_key not like E'%\\%' and storage_key not like '%://%'
    and storage_key not like '%?%' and storage_key not like '%#%');

create index if not exists profile_media_copy_orphans_status_next_idx
  on public.profile_media_copy_orphans(status, next_attempt_at, created_at);
create index if not exists profile_media_copy_orphans_deleted_idx
  on public.profile_media_copy_orphans(deleted_at) where deleted_at is not null;
create index if not exists profile_media_copy_orphans_attempt_idx
  on public.profile_media_copy_orphans(attempt_count, status);
alter table public.profile_media_copy_orphans enable row level security;

create or replace function public.claim_profile_media_copy_orphans(
  requested_limit integer,
  requested_job_id text,
  requested_retention_hours integer default 24,
  requested_claim_timeout_minutes integer default 30,
  requested_dry_run boolean default false
) returns table (id uuid, submission_id uuid, storage_key text, attempt_count integer)
language plpgsql security definer set search_path = public as $$
declare
  safe_limit integer := least(greatest(coalesce(requested_limit, 10), 1), 50);
  safe_retention_hours integer := case when requested_retention_hours between 1 and 720 then requested_retention_hours else 24 end;
  safe_claim_timeout integer := case when requested_claim_timeout_minutes between 5 and 240 then requested_claim_timeout_minutes else 30 end;
  safe_job_id text := left(nullif(trim(requested_job_id), ''), 120);
begin
  if safe_job_id is null then raise exception 'Job id is required'; end if;

  if not coalesce(requested_dry_run, false) then
    update public.profile_media_copy_orphans o
      set status = case when o.attempt_count >= 5 then 'failed' else 'retry' end,
          next_attempt_at = case when o.attempt_count >= 5 then null else now() end,
          last_error_code = 'stale_claim_recovered', claimed_at = null, claimed_by = null, updated_at = now()
      where o.status = 'processing'
        and o.claimed_at <= now() - make_interval(mins => safe_claim_timeout);

    return query
    with eligible as (
      select o.id
      from public.profile_media_copy_orphans o
      where o.status in ('pending', 'retry')
        and o.created_at <= now() - make_interval(hours => safe_retention_hours)
        and (o.next_attempt_at is null or o.next_attempt_at <= now())
        and o.attempt_count < 5
      order by coalesce(o.next_attempt_at, o.created_at), o.created_at
      for update skip locked
      limit safe_limit
    )
    update public.profile_media_copy_orphans o
      set status = 'processing', claimed_at = now(), claimed_by = safe_job_id,
          attempt_count = o.attempt_count + 1, last_attempt_at = now(), updated_at = now()
      from eligible e where o.id = e.id
      returning o.id, o.submission_id, o.storage_key, o.attempt_count;
  else
    return query
      select o.id, o.submission_id, o.storage_key, o.attempt_count + 1
      from public.profile_media_copy_orphans o
      where o.status in ('pending', 'retry')
        and o.created_at <= now() - make_interval(hours => safe_retention_hours)
        and (o.next_attempt_at is null or o.next_attempt_at <= now())
        and o.attempt_count < 5
      order by coalesce(o.next_attempt_at, o.created_at), o.created_at
      limit safe_limit;
  end if;
end $$;

create or replace function public.complete_profile_media_copy_orphan(
  requested_orphan_id uuid,
  requested_job_id text,
  requested_status text,
  requested_error_code text default null,
  requested_next_attempt_at timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare claimed public.profile_media_copy_orphans;
begin
  if requested_status not in ('deleted', 'not_found', 'protected', 'retry', 'failed') then
    raise exception 'Invalid orphan completion status';
  end if;
  if nullif(trim(requested_job_id), '') is null then raise exception 'Job id is required'; end if;
  select * into claimed from public.profile_media_copy_orphans o
    where o.id = requested_orphan_id and o.status = 'processing'
      and o.claimed_by = left(trim(requested_job_id), 120)
    for update;
  if claimed.id is null then raise exception 'Orphan claim is no longer owned by this job'; end if;
  if requested_status = 'retry' and (requested_next_attempt_at is null or requested_next_attempt_at <= now() or claimed.attempt_count >= 5) then
    raise exception 'Retry requires a future date before the attempt limit';
  end if;
  if requested_status <> 'retry' and requested_next_attempt_at is not null then raise exception 'Only retry accepts a next attempt date'; end if;
  if requested_status = 'failed' and claimed.attempt_count < 5 then raise exception 'Failed requires the attempt limit'; end if;
  update public.profile_media_copy_orphans o
    set status = requested_status,
        last_error_code = case when requested_status in ('deleted', 'not_found') then null else left(nullif(trim(requested_error_code), ''), 80) end,
        next_attempt_at = case when requested_status = 'retry' then requested_next_attempt_at else null end,
        deleted_at = case when requested_status = 'deleted' then now() else o.deleted_at end,
        verified_absent_at = case when requested_status in ('deleted', 'not_found') then now() else o.verified_absent_at end,
        claimed_at = null, claimed_by = null, updated_at = now()
    where o.id = claimed.id;
end $$;

revoke all on function public.claim_profile_media_copy_orphans(integer,text,integer,integer,boolean) from public;
revoke all on function public.claim_profile_media_copy_orphans(integer,text,integer,integer,boolean) from anon;
revoke all on function public.claim_profile_media_copy_orphans(integer,text,integer,integer,boolean) from authenticated;
grant execute on function public.claim_profile_media_copy_orphans(integer,text,integer,integer,boolean) to service_role;
revoke all on function public.complete_profile_media_copy_orphan(uuid,text,text,text,timestamptz) from public;
revoke all on function public.complete_profile_media_copy_orphan(uuid,text,text,text,timestamptz) from anon;
revoke all on function public.complete_profile_media_copy_orphan(uuid,text,text,text,timestamptz) from authenticated;
grant execute on function public.complete_profile_media_copy_orphan(uuid,text,text,text,timestamptz) to service_role;

comment on function public.claim_profile_media_copy_orphans(integer,text,integer,integer,boolean) is
  'Service-role-only bounded orphan claim with retention, stale claim recovery and SKIP LOCKED concurrency.';

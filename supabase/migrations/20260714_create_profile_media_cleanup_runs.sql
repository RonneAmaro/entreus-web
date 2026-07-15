create table public.profile_media_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null,
  mode text not null default 'dry_run',
  source text not null default 'cron',
  status text not null default 'started',
  claimed_count integer not null default 0,
  would_delete_count integer not null default 0,
  not_found_count integer not null default 0,
  protected_count integer not null default 0,
  failed_validation_count integer not null default 0,
  retry_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  duration_ms bigint null,
  error_code text null,
  created_at timestamptz not null default now(),
  constraint profile_media_cleanup_runs_job_id_check check (char_length(btrim(job_id)) between 1 and 120),
  constraint profile_media_cleanup_runs_mode_check check (mode = 'dry_run'),
  constraint profile_media_cleanup_runs_source_check check (source in ('cron', 'manual')),
  constraint profile_media_cleanup_runs_status_check check (status in ('started', 'succeeded', 'failed', 'configuration_error', 'already_running', 'expired')),
  constraint profile_media_cleanup_runs_counts_check check (claimed_count >= 0 and would_delete_count >= 0 and not_found_count >= 0 and protected_count >= 0 and failed_validation_count >= 0 and retry_count >= 0 and failed_count >= 0),
  constraint profile_media_cleanup_runs_duration_check check (duration_ms is null or duration_ms >= 0),
  constraint profile_media_cleanup_runs_completion_check check ((status = 'started' and completed_at is null) or (status <> 'started' and completed_at is not null)),
  constraint profile_media_cleanup_runs_error_code_check check (error_code is null or char_length(error_code) <= 80)
);

alter table public.profile_media_cleanup_runs enable row level security;
revoke all privileges on table public.profile_media_cleanup_runs from public;
revoke all privileges on table public.profile_media_cleanup_runs from anon;
revoke all privileges on table public.profile_media_cleanup_runs from authenticated;
grant select, insert, update on table public.profile_media_cleanup_runs to service_role;

create unique index profile_media_cleanup_runs_one_started_idx
on public.profile_media_cleanup_runs ((1))
where status = 'started';

create or replace function public.start_profile_media_cleanup_run(
  requested_job_id text,
  requested_stale_timeout_minutes integer default 30
)
returns table (run_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_job_id text;
  safe_timeout integer;
  new_run_id uuid;
begin
  safe_job_id := btrim(requested_job_id);
  if safe_job_id is null or char_length(safe_job_id) = 0 or char_length(safe_job_id) > 120 then
    raise exception using errcode = '22023', message = 'invalid job id';
  end if;
  safe_timeout := greatest(5, least(coalesce(requested_stale_timeout_minutes, 30), 240));

  perform pg_advisory_xact_lock(hashtext('profile_media_cleanup_runs:start'));
  update public.profile_media_cleanup_runs as cleanup_run
  set status = 'expired',
      completed_at = now(),
      duration_ms = greatest(
        0::bigint,
        floor(extract(epoch from (now() - cleanup_run.started_at)) * 1000)::bigint
      ),
      error_code = 'stale_run_expired'
  where cleanup_run.status = 'started'
    and cleanup_run.started_at <= now() - make_interval(mins => safe_timeout);

  begin
    insert into public.profile_media_cleanup_runs (job_id)
    values (safe_job_id)
    returning id into new_run_id;
    return query select new_run_id, 'started'::text;
  exception when unique_violation then
    return query select null::uuid, 'already_running'::text;
  end;
end;
$$;

create or replace function public.complete_profile_media_cleanup_run(
  requested_run_id uuid,
  requested_job_id text,
  requested_status text,
  requested_claimed_count integer,
  requested_would_delete_count integer,
  requested_not_found_count integer,
  requested_protected_count integer,
  requested_failed_validation_count integer,
  requested_retry_count integer,
  requested_failed_count integer,
  requested_duration_ms bigint,
  requested_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if requested_run_id is null
    or requested_job_id is null
    or char_length(btrim(requested_job_id)) = 0
    or char_length(btrim(requested_job_id)) > 120
    or requested_status is null
    or requested_status not in ('succeeded', 'failed', 'configuration_error')
  then
    return false;
  end if;

  if requested_claimed_count is null
    or requested_would_delete_count is null
    or requested_not_found_count is null
    or requested_protected_count is null
    or requested_failed_validation_count is null
    or requested_retry_count is null
    or requested_failed_count is null
    or requested_duration_ms is null
    or requested_claimed_count < 0
    or requested_would_delete_count < 0
    or requested_not_found_count < 0
    or requested_protected_count < 0
    or requested_failed_validation_count < 0
    or requested_retry_count < 0
    or requested_failed_count < 0
    or requested_duration_ms < 0
  then
    return false;
  end if;

  update public.profile_media_cleanup_runs
  set status = requested_status,
      claimed_count = requested_claimed_count,
      would_delete_count = requested_would_delete_count,
      not_found_count = requested_not_found_count,
      protected_count = requested_protected_count,
      failed_validation_count = requested_failed_validation_count,
      retry_count = requested_retry_count,
      failed_count = requested_failed_count,
      duration_ms = requested_duration_ms,
      error_code = left(requested_error_code, 80),
      completed_at = now()
  where id = requested_run_id and job_id = requested_job_id and status = 'started';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.start_profile_media_cleanup_run(text, integer) from public;
revoke all on function public.start_profile_media_cleanup_run(text, integer) from anon;
revoke all on function public.start_profile_media_cleanup_run(text, integer) from authenticated;
grant execute on function public.start_profile_media_cleanup_run(text, integer) to service_role;
revoke all on function public.complete_profile_media_cleanup_run(uuid, text, text, integer, integer, integer, integer, integer, integer, integer, bigint, text) from public;
revoke all on function public.complete_profile_media_cleanup_run(uuid, text, text, integer, integer, integer, integer, integer, integer, integer, bigint, text) from anon;
revoke all on function public.complete_profile_media_cleanup_run(uuid, text, text, integer, integer, integer, integer, integer, integer, integer, bigint, text) from authenticated;
grant execute on function public.complete_profile_media_cleanup_run(uuid, text, text, integer, integer, integer, integer, integer, integer, integer, bigint, text) to service_role;

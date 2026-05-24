-- Prepared migration for Package 41: admin/sensitive RLS hardening.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

do $$
begin
  if to_regclass('public.reports') is not null then
    alter table public.reports
      add column if not exists status text default 'pending';

    if not exists (
      select 1
      from pg_constraint
      where conname = 'reports_status_check'
        and conrelid = 'public.reports'::regclass
    ) then
      alter table public.reports
        add constraint reports_status_check
        check (status is null or status in ('pending', 'in_review', 'resolved', 'rejected', 'archived'));
    end if;

    create index if not exists reports_status_created_at_idx
      on public.reports(status, created_at desc);

    alter table public.reports enable row level security;

    drop policy if exists "Users can create reports" on public.reports;
    create policy "Users can create reports"
      on public.reports
      for insert
      to authenticated
      with check (
        reporter_id = auth.uid()
        and coalesce(status, 'pending') = 'pending'
        and (reported_post_id is not null or reported_user_id is not null)
      );

    drop policy if exists "Users can read their own reports" on public.reports;
    create policy "Users can read their own reports"
      on public.reports
      for select
      to authenticated
      using (reporter_id = auth.uid());

    drop policy if exists "Admins can read reports" on public.reports;
    create policy "Admins can read reports"
      on public.reports
      for select
      to authenticated
      using (public.is_admin());

    drop policy if exists "Admins can update reports" on public.reports;
    create policy "Admins can update reports"
      on public.reports
      for update
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

do $$
begin
  if to_regclass('public.internal_feedback_reports') is not null then
    alter table public.internal_feedback_reports enable row level security;

    drop policy if exists "Users can create feedback reports" on public.internal_feedback_reports;
    create policy "Users can create feedback reports"
      on public.internal_feedback_reports
      for insert
      to authenticated
      with check (
        (user_id is null or auth.uid() = user_id)
        and status = 'open'
      );

    drop policy if exists "Admins can read feedback reports" on public.internal_feedback_reports;
    create policy "Admins can read feedback reports"
      on public.internal_feedback_reports
      for select
      to authenticated
      using (public.is_admin());

    drop policy if exists "Admins can update feedback reports" on public.internal_feedback_reports;
    create policy "Admins can update feedback reports"
      on public.internal_feedback_reports
      for update
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

create or replace function public.prevent_age_verification_user_review_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if auth.uid() is null or old.user_id <> auth.uid() then
    raise exception 'Not allowed to update this verification request';
  end if;

  if old.status <> 'pending' or new.status <> old.status then
    raise exception 'Users cannot change verification review status';
  end if;

  if new.user_id is distinct from old.user_id
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.admin_notes is distinct from old.admin_notes
    or new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Users cannot change verification review fields';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.age_verification_requests') is not null then
    drop trigger if exists prevent_age_verification_user_review_changes
      on public.age_verification_requests;

    create trigger prevent_age_verification_user_review_changes
      before update on public.age_verification_requests
      for each row
      execute function public.prevent_age_verification_user_review_changes();
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.approve_itacash_purchase_request_v2(uuid, uuid)') is not null then
    revoke all on function public.approve_itacash_purchase_request_v2(uuid, uuid) from public;
    revoke all on function public.approve_itacash_purchase_request_v2(uuid, uuid) from authenticated;
  end if;

  if to_regprocedure('public.reject_itacash_purchase_request_v2(uuid, uuid, text)') is not null then
    revoke all on function public.reject_itacash_purchase_request_v2(uuid, uuid, text) from public;
    revoke all on function public.reject_itacash_purchase_request_v2(uuid, uuid, text) from authenticated;
  end if;
end $$;

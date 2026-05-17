-- Prepared migration for internal 18+ verification review panel.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.profiles
  add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('user', 'admin'));
  end if;
end $$;

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

drop policy if exists "Admins can read age verification requests"
  on public.age_verification_requests;

create policy "Admins can read age verification requests"
  on public.age_verification_requests
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update age verification requests"
  on public.age_verification_requests;

create policy "Admins can update age verification requests"
  on public.age_verification_requests
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can read profiles for verification"
  on public.profiles;

create policy "Admins can read profiles for verification"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update profiles for verification"
  on public.profiles;

create policy "Admins can update profiles for verification"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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

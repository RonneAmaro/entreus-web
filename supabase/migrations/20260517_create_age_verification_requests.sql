-- Prepared migration for 18+ verification request flow.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.age_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  birth_date date null,
  user_statement text null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  admin_notes text null,
  rejection_reason text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint age_verification_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'canceled'))
);

create index if not exists age_verification_requests_user_id_idx
  on public.age_verification_requests(user_id);

create index if not exists age_verification_requests_status_idx
  on public.age_verification_requests(status);

create index if not exists age_verification_requests_created_at_idx
  on public.age_verification_requests(created_at);

create or replace function public.set_age_verification_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_age_verification_requests_updated_at
  on public.age_verification_requests;

create trigger set_age_verification_requests_updated_at
  before update on public.age_verification_requests
  for each row
  execute function public.set_age_verification_requests_updated_at();

alter table public.age_verification_requests enable row level security;

drop policy if exists "Users can read their own age verification requests"
  on public.age_verification_requests;

create policy "Users can read their own age verification requests"
  on public.age_verification_requests
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create their own age verification requests"
  on public.age_verification_requests;

create policy "Users can create their own age verification requests"
  on public.age_verification_requests
  for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Users cannot update age verification requests directly"
  on public.age_verification_requests;

create policy "Users cannot update age verification requests directly"
  on public.age_verification_requests
  for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "Users cannot delete age verification requests directly"
  on public.age_verification_requests;

create policy "Users cannot delete age verification requests directly"
  on public.age_verification_requests
  for delete
  to authenticated
  using (false);

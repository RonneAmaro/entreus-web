-- Prepared migration for the first 18+ safety and minor protection layer.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists is_minor boolean default false,
  add column if not exists parental_consent_status text default 'not_required',
  add column if not exists wants_18_plus boolean default false,
  add column if not exists age_verification_status text default 'not_started',
  add column if not exists age_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_parental_consent_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_parental_consent_status_check
      check (parental_consent_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_age_verification_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_age_verification_status_check
      check (age_verification_status in ('not_started', 'pending', 'approved', 'rejected'));
  end if;
end $$;

update public.profiles
set
  is_minor = case
    when birth_date is null then false
    else birth_date > (current_date - interval '18 years')
  end,
  parental_consent_status = case
    when birth_date is not null and birth_date > (current_date - interval '18 years')
      then coalesce(nullif(parental_consent_status, 'not_required'), 'pending')
    else 'not_required'
  end
where birth_date is not null;

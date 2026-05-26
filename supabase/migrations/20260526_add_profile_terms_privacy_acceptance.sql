-- Prepared migration for formal Terms of Use and Privacy Policy acceptance.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_version text;

comment on column public.profiles.terms_accepted_at is
  'Timestamp when the user formally accepted the EntreUS Terms of Use.';

comment on column public.profiles.privacy_accepted_at is
  'Timestamp when the user formally accepted the EntreUS Privacy Policy.';

comment on column public.profiles.terms_version is
  'Terms of Use version accepted by the user.';

comment on column public.profiles.privacy_version is
  'Privacy Policy version accepted by the user.';

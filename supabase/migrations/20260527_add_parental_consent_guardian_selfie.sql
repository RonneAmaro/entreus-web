-- Prepared migration for Package 46: guardian selfie proof for parental consent.
-- Review and apply manually in Supabase. Do not run automatically from Codex.
-- Storage bucket required: age-verifications, private.
-- Selfie files are stored under: parental-consent/{requestId}/guardian-selfie.{ext}

alter table public.parental_consent_requests
  add column if not exists guardian_selfie_path text,
  add column if not exists guardian_selfie_uploaded_at timestamptz,
  add column if not exists approval_user_agent text;

comment on column public.parental_consent_requests.guardian_selfie_path is
  'Private Supabase Storage path for the guardian selfie proof used in parental consent.';

comment on column public.parental_consent_requests.guardian_selfie_uploaded_at is
  'Timestamp when the guardian selfie proof was uploaded.';

comment on column public.parental_consent_requests.approval_user_agent is
  'User agent captured when the guardian submitted the parental consent decision.';

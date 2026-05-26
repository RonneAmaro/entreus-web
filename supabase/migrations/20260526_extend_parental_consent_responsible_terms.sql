-- Prepared migration for parental consent responsible terms.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.parental_consent_requests
  add column if not exists guardian_name text,
  add column if not exists relationship text,
  add column if not exists consent_version text not null default '2026-05',
  add column if not exists signed_name text,
  add column if not exists signed_at timestamptz,
  add column if not exists token_hash text;

create unique index if not exists parental_consent_requests_token_hash_unique_idx
  on public.parental_consent_requests(token_hash)
  where token_hash is not null;

comment on column public.parental_consent_requests.guardian_name is
  'Name of the parent or legal guardian informed by the minor.';

comment on column public.parental_consent_requests.relationship is
  'Relationship between the responsible adult and the minor.';

comment on column public.parental_consent_requests.consent_version is
  'Version of the parental consent terms accepted or rejected.';

comment on column public.parental_consent_requests.signed_name is
  'Typed full name used by the responsible adult as online signature.';

comment on column public.parental_consent_requests.signed_at is
  'Timestamp when the responsible adult signed the parental consent decision.';

comment on column public.parental_consent_requests.token_hash is
  'Hash of the public parental consent token for new requests. The legacy token column is kept for compatibility.';

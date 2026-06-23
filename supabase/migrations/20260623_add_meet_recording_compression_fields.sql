-- Pacote 49C: política de compactação e retenção para metadata privada do Meet.
-- Aplicar manualmente depois de 20260623_create_meet_room_recordings.sql.
-- Esta migration não cria bucket, não altera R2 e não habilita Egress.

begin;

alter table public.meet_room_recordings
  add column if not exists compression_profile text,
  add column if not exists retention_expires_at timestamptz,
  add column if not exists storage_estimate_bytes bigint;

alter table public.meet_room_recordings
  drop constraint if exists meet_room_recordings_compression_profile_check;

alter table public.meet_room_recordings
  add constraint meet_room_recordings_compression_profile_check
  check (compression_profile is null or compression_profile in ('economy', 'standard'));

alter table public.meet_room_recordings
  drop constraint if exists meet_room_recordings_storage_estimate_check;

alter table public.meet_room_recordings
  add constraint meet_room_recordings_storage_estimate_check
  check (storage_estimate_bytes is null or storage_estimate_bytes >= 0);

alter table public.meet_room_recordings
  drop constraint if exists meet_room_recordings_retention_after_creation_check;

alter table public.meet_room_recordings
  add constraint meet_room_recordings_retention_after_creation_check
  check (retention_expires_at is null or retention_expires_at > created_at);

create index if not exists meet_room_recordings_retention_expires_at_idx
  on public.meet_room_recordings(retention_expires_at)
  where retention_expires_at is not null;

comment on column public.meet_room_recordings.compression_profile is
  'Server-selected recording profile. Public callers cannot choose high-quality or unlimited encoding.';
comment on column public.meet_room_recordings.retention_expires_at is
  'Deadline for authorized download access. Physical R2 deletion is intentionally handled by a future retention job.';
comment on column public.meet_room_recordings.storage_estimate_bytes is
  'Expected storage estimate for planning; it is not a public URL or object identifier.';

commit;

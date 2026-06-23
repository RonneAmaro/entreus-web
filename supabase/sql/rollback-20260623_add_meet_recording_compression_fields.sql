-- Manual rollback for 20260623_add_meet_recording_compression_fields.sql.
-- Review retention obligations first. This rollback changes only SQL metadata and
-- intentionally never deletes any private R2 object.

begin;

drop index if exists public.meet_room_recordings_retention_expires_at_idx;

alter table public.meet_room_recordings
  drop constraint if exists meet_room_recordings_retention_after_creation_check,
  drop constraint if exists meet_room_recordings_storage_estimate_check,
  drop constraint if exists meet_room_recordings_compression_profile_check,
  drop column if exists storage_estimate_bytes,
  drop column if exists retention_expires_at,
  drop column if exists compression_profile;

commit;

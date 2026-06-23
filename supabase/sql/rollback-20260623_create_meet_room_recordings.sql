-- Manual rollback for 20260623_create_meet_room_recordings.sql.
-- Review retention obligations and any private R2 objects before executing. This SQL
-- removes only database metadata; it intentionally never deletes recording objects.

drop table if exists public.meet_room_recordings;

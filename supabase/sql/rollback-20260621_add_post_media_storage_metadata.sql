-- REVIEW MANUALLY. This rollback leaves metadata intact to avoid data loss.
drop index if exists public.post_media_access_level_idx;
drop index if exists public.post_media_storage_provider_idx;
drop index if exists public.post_media_storage_bucket_idx;
drop index if exists public.post_media_storage_key_idx;
alter table public.post_media drop constraint if exists post_media_access_level_check;
alter table public.post_media drop constraint if exists post_media_storage_provider_check;
-- Do not drop metadata columns without export/review: they may be needed by protected files.

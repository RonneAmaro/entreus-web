-- Package 39B: REVIEW AND APPLY MANUALLY. No files are moved or deleted.
alter table public.post_media
  add column if not exists storage_provider text,
  add column if not exists storage_bucket text,
  add column if not exists storage_key text,
  add column if not exists access_level text not null default 'public';
do $$ begin
  alter table public.post_media drop constraint if exists post_media_access_level_check;
  alter table public.post_media add constraint post_media_access_level_check check (access_level in ('public','protected','adult_private'));
  alter table public.post_media drop constraint if exists post_media_storage_provider_check;
  alter table public.post_media add constraint post_media_storage_provider_check check (storage_provider is null or storage_provider in ('legacy_url','r2','supabase_storage'));
end $$;
create index if not exists post_media_access_level_idx on public.post_media(access_level);
create index if not exists post_media_storage_provider_idx on public.post_media(storage_provider);
create index if not exists post_media_storage_bucket_idx on public.post_media(storage_bucket);
create index if not exists post_media_storage_key_idx on public.post_media(storage_key) where storage_key is not null;

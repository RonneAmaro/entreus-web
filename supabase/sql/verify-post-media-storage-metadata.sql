-- Read-only verification for Packages 39B and 39C. Never select URLs, keys,
-- post text, profile data, or any other personal data from this script.
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'post_media'
  and column_name in ('storage_provider', 'storage_bucket', 'storage_key', 'access_level')
order by column_name;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.post_media'::regclass
  and conname in ('post_media_access_level_check', 'post_media_storage_provider_check')
order by conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'post_media'
  and indexname in (
    'post_media_access_level_idx',
    'post_media_storage_provider_idx',
    'post_media_storage_bucket_idx',
    'post_media_storage_key_idx'
  )
order by indexname;

select access_level, count(*) as media_count
from public.post_media
group by access_level
order by access_level nulls first;

select storage_provider, count(*) as media_count
from public.post_media
group by storage_provider
order by storage_provider nulls first;

select
  count(*) filter (where access_level = 'adult_private') as adult_private_total,
  count(*) filter (where access_level = 'adult_private' and nullif(storage_key, '') is null) as adult_private_without_storage_key,
  count(*) filter (where access_level = 'adult_private' and nullif(media_url, '') is not null) as adult_private_with_legacy_media_url,
  count(*) filter (where nullif(storage_provider, '') is null) as legacy_without_storage_provider,
  count(*) filter (where nullif(storage_key, '') is null) as legacy_without_storage_key,
  count(*) filter (where access_level is null or access_level <> 'adult_private') as potentially_public_or_legacy_total
from public.post_media;

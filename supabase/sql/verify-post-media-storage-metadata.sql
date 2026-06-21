-- Read-only verification after manually applying Package 39B.
select column_name,data_type,column_default,is_nullable from information_schema.columns where table_schema='public' and table_name='post_media' and column_name in ('storage_provider','storage_bucket','storage_key','access_level') order by column_name;
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.post_media'::regclass and conname like 'post_media_%_check';
select indexname,indexdef from pg_indexes where schemaname='public' and tablename='post_media' and indexname like 'post_media_storage_%' or indexname='post_media_access_level_idx';
select access_level,storage_provider,count(*) from public.post_media group by access_level,storage_provider order by access_level,storage_provider;

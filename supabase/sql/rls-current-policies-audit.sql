-- Read-only metadata audit. Run manually in Supabase SQL Editor.
-- It never selects application rows, post content, media URLs, or personal data.
with important_tables(schema_name, table_name) as (values
  ('public','posts'),('public','post_media'),('public','comments'),('public','saved_posts'),('public','reposts'),('public','likes'),('public','reports'),('public','notifications'),('public','profiles'),('public','age_verification_requests'),('public','itacash_purchase_requests'),('public','message_attachments'),('public','meet_room_chat_messages'),('public','meet_room_message_attachments'),('public','internal_feedback_reports'),('storage','objects'))
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced from pg_class c join pg_namespace n on n.oid=c.relnamespace join important_tables i on i.schema_name=n.nspname and i.table_name=c.relname where c.relkind in ('r','p') order by 1,2;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname;

select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema in ('public','storage') and grantee in ('anon','authenticated','service_role') order by table_schema,table_name,grantee,privilege_type;

select n.nspname as schema_name,p.proname as function_name,pg_get_function_identity_arguments(p.oid) as arguments from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef=true order by function_name;

select table_schema,table_name,view_definition from information_schema.views where table_schema='public' order by table_name;

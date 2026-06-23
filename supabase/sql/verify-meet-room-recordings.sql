-- Verify: meet_room_recordings
-- Este script só consulta estrutura, RLS, policies e constraints.
-- Não altera banco, não insere dados e não apaga nada.

select
  schemaname as table_schema,
  tablename as table_name,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename = 'meet_room_recordings';

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'meet_room_recordings'
order by ordinal_position;

select
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename = 'meet_room_recordings'
order by policyname;

select
  conname as constraint_name,
  contype as constraint_type
from pg_constraint
where conrelid = 'public.meet_room_recordings'::regclass
order by conname;

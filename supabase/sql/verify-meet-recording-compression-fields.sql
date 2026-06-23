-- Verify: Pacote 49C, campos de compactação e retenção de Meet.
-- Somente leitura: não altera banco, não seleciona dados de gravações e não expõe storage keys.

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'meet_room_recordings'
  and column_name in ('compression_profile', 'retention_expires_at', 'storage_estimate_bytes')
order by ordinal_position;

select
  conname as constraint_name,
  contype as constraint_type
from pg_constraint
where conrelid = 'public.meet_room_recordings'::regclass
  and conname in (
    'meet_room_recordings_compression_profile_check',
    'meet_room_recordings_storage_estimate_check',
    'meet_room_recordings_retention_after_creation_check'
  )
order by conname;

select
  indexname as index_name
from pg_indexes
where schemaname = 'public'
  and tablename = 'meet_room_recordings'
  and indexname = 'meet_room_recordings_retention_expires_at_idx';

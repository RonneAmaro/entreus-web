-- Package 08.4: local-only until reviewed through the Supabase migration gate.
-- Add likes to Realtime without changing any existing publication membership.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'likes'
    ) then
      alter publication supabase_realtime add table public.likes;
    end if;
  end if;
end $$;

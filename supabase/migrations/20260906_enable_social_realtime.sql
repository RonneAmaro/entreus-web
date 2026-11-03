-- Enable social realtime for posts, comments and notifications on EntreUS DEV.
-- Adds the tables to the supabase_realtime publication idempotently.
--
-- Realtime events are consumed ONLY as invalidation/refetch signals by the
-- frontend (lib/social-realtime.ts), never to reconstruct rows client-side.
--
-- comments needs REPLICA IDENTITY FULL so DELETE payloads carry the full old
-- row (including post_id), allowing the client filter post_id=eq.<post> to
-- also apply to DELETE events. Cost: old row version stored in WAL for this
-- table only (comments is small/medium volume; acceptable for beta).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
    ) then
      alter publication supabase_realtime add table public.posts;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
    ) then
      alter publication supabase_realtime add table public.comments;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;

-- Full old-row payloads for comments so DELETE events can be filtered by post_id.
alter table public.comments replica identity full;

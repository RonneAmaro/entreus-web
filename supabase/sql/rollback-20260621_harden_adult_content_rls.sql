-- REVIEW MANUALLY. Removes only Package 38 named policies/functions.
-- Do NOT disable RLS as a rollback shortcut; investigate production access first.
drop policy if exists "Adult-safe post select" on public.posts;
drop policy if exists "Adult-safe post insert" on public.posts;
drop policy if exists "Adult-safe post update" on public.posts;
drop policy if exists "Adult-safe post delete" on public.posts;
drop policy if exists "Adult-safe comment select" on public.comments;
drop policy if exists "Adult-safe comment insert" on public.comments;
drop policy if exists "Adult-safe comment update" on public.comments;
drop policy if exists "Adult-safe comment delete" on public.comments;
drop policy if exists "Adult-safe like select" on public.likes;
drop policy if exists "Adult-safe like insert" on public.likes;
drop policy if exists "Adult-safe like delete" on public.likes;
drop policy if exists "Adult-safe post media select" on public.post_media;
drop policy if exists "Adult-safe repost select" on public.reposts;
drop function if exists public.can_view_post_for_rls(uuid,text,text,text);
drop function if exists public.can_view_adult_content_for_rls(uuid);

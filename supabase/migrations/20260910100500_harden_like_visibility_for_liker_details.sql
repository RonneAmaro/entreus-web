-- Package 08.4: local-only companion migration for public liker details.
-- Keep likes hidden when either account has blocked the other. This mirrors
-- the existing comments policy and is enforced by RLS, not a client filter.

drop policy if exists "Adult-safe like select" on public.likes;

create policy "Adult-safe like select"
on public.likes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = likes.post_id
      and public.can_view_post_for_rls(
        p.user_id,
        p.community_type,
        p.content_rating,
        p.moderation_status
      )
  )
  and (
    auth.uid() is null
    or not exists (
      select 1
      from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = likes.user_id)
         or (b.blocker_id = likes.user_id and b.blocked_id = auth.uid())
    )
  )
);

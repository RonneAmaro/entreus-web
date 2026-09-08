-- Beta RC1 hardening. LOCAL ONLY until reviewed and applied through the
-- normal Supabase migration gate.

-- Comments remain subject to the existing adult-content policy and are also
-- hidden bidirectionally when either account has blocked the other.
drop policy if exists "Adult-safe comment select" on public.comments;
create policy "Adult-safe comment select"
on public.comments
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = comments.post_id
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
      where (b.blocker_id = auth.uid() and b.blocked_id = comments.user_id)
         or (b.blocker_id = comments.user_id and b.blocked_id = auth.uid())
    )
  )
);

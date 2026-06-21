-- Package 38: REVIEW AND APPLY MANUALLY in Supabase SQL Editor.
-- Protects table metadata/interactions; it does not change storage.objects or public media buckets.

create or replace function public.can_view_adult_content_for_rls(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user_id is not null and p_user_id = auth.uid() and exists (
    select 1 from public.profiles
    where id = p_user_id
      and is_minor = false
      and wants_18_plus = true
      and age_verification_status = 'approved'
  );
$$;

create or replace function public.can_view_post_for_rls(
  p_owner_id uuid, p_community_type text, p_content_rating text, p_moderation_status text
)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when coalesce(p_moderation_status, 'active') <> 'active' then p_owner_id = auth.uid()
    when p_community_type = 'adult_18plus' or p_content_rating = 'adult_18plus'
      then public.can_view_adult_content_for_rls(auth.uid())
    else true
  end;
$$;

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;

drop policy if exists "Adult-safe post select" on public.posts;
drop policy if exists "Adult-safe post insert" on public.posts;
drop policy if exists "Adult-safe post update" on public.posts;
drop policy if exists "Adult-safe post delete" on public.posts;
create policy "Adult-safe post select" on public.posts for select to anon, authenticated
  using (public.can_view_post_for_rls(user_id, community_type, content_rating, moderation_status));
create policy "Adult-safe post insert" on public.posts for insert to authenticated with check (
  user_id = auth.uid() and (
    (community_type <> 'adult_18plus' and content_rating <> 'adult_18plus') or
    (community_type = 'adult_18plus' and content_rating = 'adult_18plus' and public.can_view_adult_content_for_rls(auth.uid()))
  )
);
create policy "Adult-safe post update" on public.posts for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (
    (user_id = auth.uid() or public.is_admin()) and (
      (community_type <> 'adult_18plus' and content_rating <> 'adult_18plus') or
      (community_type = 'adult_18plus' and content_rating = 'adult_18plus' and public.can_view_adult_content_for_rls(auth.uid())) or
      public.is_admin()
    )
  );
create policy "Adult-safe post delete" on public.posts for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Adult-safe comment select" on public.comments;
drop policy if exists "Adult-safe comment insert" on public.comments;
drop policy if exists "Adult-safe comment update" on public.comments;
drop policy if exists "Adult-safe comment delete" on public.comments;
create policy "Adult-safe comment select" on public.comments for select to anon, authenticated using (
  exists (select 1 from public.posts p where p.id = comments.post_id and public.can_view_post_for_rls(p.user_id, p.community_type, p.content_rating, p.moderation_status))
);
create policy "Adult-safe comment insert" on public.comments for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.posts p where p.id = comments.post_id and public.can_view_post_for_rls(p.user_id, p.community_type, p.content_rating, p.moderation_status))
);
create policy "Adult-safe comment update" on public.comments for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "Adult-safe comment delete" on public.comments for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Adult-safe like select" on public.likes;
drop policy if exists "Adult-safe like insert" on public.likes;
drop policy if exists "Adult-safe like delete" on public.likes;
create policy "Adult-safe like select" on public.likes for select to anon, authenticated using (
  exists (select 1 from public.posts p where p.id = likes.post_id and public.can_view_post_for_rls(p.user_id, p.community_type, p.content_rating, p.moderation_status))
);
create policy "Adult-safe like insert" on public.likes for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.posts p where p.id = likes.post_id and public.can_view_post_for_rls(p.user_id, p.community_type, p.content_rating, p.moderation_status))
);
create policy "Adult-safe like delete" on public.likes for delete to authenticated using (user_id = auth.uid() or public.is_admin());

do $$ declare item record; begin
  for item in select tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('post_media', 'reposts') and cmd in ('SELECT', 'ALL') loop
    execute format('drop policy if exists %I on public.%I', item.policyname, item.tablename);
  end loop;
end $$;
drop policy if exists "Adult-safe post media select" on public.post_media;
create policy "Adult-safe post media select" on public.post_media for select to anon, authenticated using (
  exists (select 1 from public.posts p where p.id = post_media.post_id and public.can_view_post_for_rls(p.user_id, p.community_type, p.content_rating, p.moderation_status))
);
drop policy if exists "Adult-safe repost select" on public.reposts;
create policy "Adult-safe repost select" on public.reposts for select to anon, authenticated using (
  exists (select 1 from public.posts p where p.id = reposts.post_id and public.can_view_post_for_rls(p.user_id, p.community_type, p.content_rating, p.moderation_status))
);

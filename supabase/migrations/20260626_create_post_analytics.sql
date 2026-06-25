-- Package 39: basic creator/post analytics.
-- Review and apply manually in Supabase. Do not run automatically from Codex.
-- This migration stores authorized post view events without raw IP addresses.

create table if not exists public.post_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  viewer_id uuid null references auth.users(id) on delete cascade,
  viewer_key text null,
  source text not null default 'unknown',
  viewed_date date not null default current_date,
  created_at timestamptz not null default now(),
  constraint post_views_source_check check (source in ('post', 'feed', 'profile', 'saved', 'unknown')),
  constraint post_views_viewer_identity_check check (viewer_id is not null or viewer_key is not null)
);

create index if not exists post_views_post_created_at_idx
  on public.post_views(post_id, created_at desc);

create index if not exists post_views_creator_created_at_idx
  on public.post_views(creator_id, created_at desc);

create index if not exists post_views_viewer_post_created_at_idx
  on public.post_views(viewer_id, post_id, created_at desc)
  where viewer_id is not null;

create unique index if not exists post_views_unique_viewer_day_idx
  on public.post_views(post_id, viewer_id, viewed_date)
  where viewer_id is not null;

create unique index if not exists post_views_unique_viewer_key_day_idx
  on public.post_views(post_id, viewer_key, viewed_date)
  where viewer_key is not null;

alter table public.post_views enable row level security;

drop policy if exists "Creators can read own post views"
  on public.post_views;

create policy "Creators can read own post views"
  on public.post_views
  for select
  to authenticated
  using (creator_id = auth.uid() or public.is_admin());

revoke all on table public.post_views from anon, authenticated;
grant select on table public.post_views to authenticated;

create or replace function public.record_post_view(p_post_id uuid, p_source text default 'unknown')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_post public.posts;
  v_source text;
  v_is_admin boolean := public.is_admin();
  v_is_adult boolean;
  v_view_id uuid;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_post_id is null then
    raise exception 'Post not found';
  end if;

  v_source := lower(btrim(coalesce(p_source, '')));
  if v_source not in ('post', 'feed', 'profile', 'saved') then
    v_source := 'unknown';
  end if;

  select *
  into v_post
  from public.posts
  where id = p_post_id;

  if v_post.id is null then
    raise exception 'Post not found';
  end if;

  if coalesce(v_post.moderation_status, 'active') <> 'active'
    and not (v_is_admin or v_post.user_id = v_viewer_id) then
    raise exception 'Post not found';
  end if;

  v_is_adult := (
    v_post.community_type = 'adult_18plus'
    or v_post.content_rating = 'adult_18plus'
    or lower(btrim(coalesce(v_post.category, ''))) in ('adulto', 'sensual', '18plus')
  );

  if v_is_adult
    and not (v_is_admin or public.can_view_adult_content_for_rls(v_viewer_id)) then
    raise exception 'Adult content requires 18+ verification';
  end if;

  if coalesce(v_post.visibility, 'public') = 'private'
    and not (v_is_admin or v_post.user_id = v_viewer_id) then
    raise exception 'Post not found';
  end if;

  if coalesce(v_post.visibility, 'public') = 'followers'
    and not (
      v_is_admin
      or v_post.user_id = v_viewer_id
      or exists (
        select 1
        from public.follows
        where follower_id = v_viewer_id
          and following_id = v_post.user_id
      )
    ) then
    raise exception 'Post not found';
  end if;

  if coalesce(v_post.is_paid, false) = true
    and coalesce(v_post.price_itacash, 0) > 0
    and not (
      v_is_admin
      or v_post.user_id = v_viewer_id
      or exists (
        select 1
        from public.paid_post_unlocks
        where post_id = p_post_id
          and buyer_id = v_viewer_id
      )
    ) then
    raise exception 'Post not found';
  end if;

  if exists (
    select 1
    from public.post_views
    where post_id = p_post_id
      and viewer_id = v_viewer_id
      and viewed_date = current_date
  ) then
    return jsonb_build_object('success', true, 'counted', false, 'deduped', true);
  end if;

  insert into public.post_views (
    post_id,
    creator_id,
    viewer_id,
    source,
    viewed_date
  )
  values (
    p_post_id,
    v_post.user_id,
    v_viewer_id,
    v_source,
    current_date
  )
  returning id into v_view_id;

  return jsonb_build_object(
    'success', true,
    'counted', v_view_id is not null,
    'deduped', false
  );
end;
$$;

revoke all on function public.record_post_view(uuid, text) from public;
grant execute on function public.record_post_view(uuid, text) to authenticated;

-- Social graph RLS baseline for blocks, follows, interests, and profile interests.
-- SECURITY DEFINER functions that inspect these tables remain compatible because
-- table owners retain PostgreSQL's normal RLS bypass behavior.

alter table public.blocks enable row level security;
alter table public.follows enable row level security;
alter table public.interests enable row level security;
alter table public.profile_interests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'blocks_blocker_not_self'
      and conrelid = 'public.blocks'::regclass
  ) then
    alter table public.blocks
      add constraint blocks_blocker_not_self
      check (blocker_id <> blocked_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'follows_follower_not_self'
      and conrelid = 'public.follows'::regclass
  ) then
    alter table public.follows
      add constraint follows_follower_not_self
      check (follower_id <> following_id);
  end if;
end
$$;

revoke all privileges on table public.blocks from public, anon, authenticated;
revoke all privileges on table public.follows from public, anon, authenticated;
revoke all privileges on table public.interests from public, anon, authenticated;
revoke all privileges on table public.profile_interests from public, anon, authenticated;

grant select, insert, delete on table public.blocks to authenticated;

grant select on table public.follows to anon, authenticated;
grant insert, delete on table public.follows to authenticated;

grant select on table public.interests to anon, authenticated;

grant select, insert, delete on table public.profile_interests to authenticated;

grant all privileges on table public.blocks to service_role, postgres;
grant all privileges on table public.follows to service_role, postgres;
grant all privileges on table public.interests to service_role, postgres;
grant all privileges on table public.profile_interests to service_role, postgres;

create policy blocks_select_involved
  on public.blocks
  for select
  to authenticated
  using (
    (select auth.uid()) = blocker_id
    or (select auth.uid()) = blocked_id
  );

create policy blocks_insert_own
  on public.blocks
  for insert
  to authenticated
  with check (
    (select auth.uid()) = blocker_id
    and blocker_id <> blocked_id
  );

create policy blocks_delete_own
  on public.blocks
  for delete
  to authenticated
  using ((select auth.uid()) = blocker_id);

create policy follows_select_public
  on public.follows
  for select
  to anon, authenticated
  using (true);

create policy follows_insert_own
  on public.follows
  for insert
  to authenticated
  with check (
    (select auth.uid()) = follower_id
    and follower_id <> following_id
  );

create policy follows_delete_own
  on public.follows
  for delete
  to authenticated
  using ((select auth.uid()) = follower_id);

create policy interests_select_public
  on public.interests
  for select
  to anon, authenticated
  using (true);

create policy profile_interests_select_own
  on public.profile_interests
  for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy profile_interests_insert_own
  on public.profile_interests
  for insert
  to authenticated
  with check ((select auth.uid()) = profile_id);

create policy profile_interests_delete_own
  on public.profile_interests
  for delete
  to authenticated
  using ((select auth.uid()) = profile_id);

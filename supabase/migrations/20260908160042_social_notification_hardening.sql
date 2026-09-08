-- Beta RC1 authoritative social notifications. LOCAL ONLY until reviewed and
-- applied through the normal Supabase migration gate.

-- New social notifications carry a server-generated idempotency key. Existing
-- rows are preserved; one representative of each legacy social event is
-- backfilled so a later like/repost/follow cannot create another duplicate.
alter table public.notifications
  add column if not exists social_dedup_key text null;

with ranked_social_notifications as (
  select
    id,
    concat_ws(':', type, actor_id::text, user_id::text, coalesce(post_id::text, '')) as dedup_key,
    row_number() over (
      partition by type, actor_id, user_id, post_id
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.notifications
  where type in ('like', 'repost', 'follow')
    and actor_id is not null
)
update public.notifications n
set social_dedup_key = ranked.dedup_key
from ranked_social_notifications ranked
where n.id = ranked.id
  and ranked.duplicate_rank = 1
  and n.social_dedup_key is null;

create unique index if not exists notifications_social_dedup_key_once_idx
  on public.notifications(social_dedup_key)
  where social_dedup_key is not null;

create or replace function public.notify_social_relation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_recipient_id uuid;
  v_post_id uuid;
  v_type text;
  v_dedup_key text;
begin
  if tg_table_name = 'likes' then
    v_actor_id := new.user_id;
    v_post_id := new.post_id;
    v_type := 'like';
  elsif tg_table_name = 'reposts' then
    v_actor_id := new.user_id;
    v_post_id := new.post_id;
    v_type := 'repost';
  elsif tg_table_name = 'follows' then
    v_actor_id := new.follower_id;
    v_recipient_id := new.following_id;
    v_type := 'follow';
  else
    raise exception 'unsupported_social_relation' using errcode = '22023';
  end if;

  if v_actor_id is distinct from auth.uid()
    and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'social_actor_mismatch' using errcode = '42501';
  end if;

  if v_post_id is not null then
    select p.user_id into v_recipient_id
    from public.posts p
    where p.id = v_post_id;
  end if;

  if v_recipient_id is null or v_recipient_id = v_actor_id then
    return new;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = v_actor_id and b.blocked_id = v_recipient_id)
       or (b.blocker_id = v_recipient_id and b.blocked_id = v_actor_id)
  ) then
    return new;
  end if;

  v_dedup_key := concat_ws(':', v_type, v_actor_id::text, v_recipient_id::text, coalesce(v_post_id::text, ''));

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    post_id,
    social_dedup_key
  ) values (
    v_recipient_id,
    v_actor_id,
    v_type,
    v_post_id,
    v_dedup_key
  )
  on conflict (social_dedup_key)
    where social_dedup_key is not null
    do nothing;

  return new;
end
$$;

drop trigger if exists likes_notify_authoritatively on public.likes;
create trigger likes_notify_authoritatively
after insert on public.likes
for each row execute function public.notify_social_relation_insert();

drop trigger if exists reposts_notify_authoritatively on public.reposts;
create trigger reposts_notify_authoritatively
after insert on public.reposts
for each row execute function public.notify_social_relation_insert();

drop trigger if exists follows_notify_authoritatively on public.follows;
create trigger follows_notify_authoritatively
after insert on public.follows
for each row execute function public.notify_social_relation_insert();

-- Social notification recipients must never be supplied by browser code.
-- A restrictive policy composes with the existing recipient read/update
-- policies and still permits authenticated admins to create moderation-only
-- notifications until that older flow is moved behind its RPC.
alter table public.notifications enable row level security;
drop policy if exists "Client cannot insert social notifications" on public.notifications;
create policy "Client cannot insert social notifications"
on public.notifications
as restrictive
for insert
to authenticated
with check (
  type not in ('like', 'repost', 'follow', 'comment')
  and public.is_admin()
);

revoke insert on table public.notifications from anon;
revoke all on function public.notify_social_relation_insert() from public, anon, authenticated;

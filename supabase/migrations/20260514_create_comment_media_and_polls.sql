-- Prepared migration for comment media and polls.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.comment_media (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  media_url text not null,
  media_type text not null,
  created_at timestamptz not null default now(),
  constraint comment_media_media_type_check check (media_type in ('image', 'video', 'gif'))
);

create index if not exists comment_media_comment_id_idx on public.comment_media(comment_id);
create index if not exists comment_media_user_id_idx on public.comment_media(user_id);

alter table public.comment_media enable row level security;

drop policy if exists "Comment media is readable with comments" on public.comment_media;
create policy "Comment media is readable with comments"
on public.comment_media
for select
using (
  exists (
    select 1
    from public.comments c
    where c.id = comment_media.comment_id
  )
);

drop policy if exists "Authenticated users can add own comment media" on public.comment_media;
create policy "Authenticated users can add own comment media"
on public.comment_media
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.comments c
    where c.id = comment_media.comment_id
      and c.user_id = auth.uid()
  )
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text,
  allow_multiple boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint polls_target_type_check check (target_type in ('post', 'comment'))
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_text text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint poll_votes_one_vote_per_user unique (poll_id, user_id)
);

create index if not exists polls_target_type_target_id_idx on public.polls(target_type, target_id);
create index if not exists poll_options_poll_id_idx on public.poll_options(poll_id);
create index if not exists poll_votes_poll_id_idx on public.poll_votes(poll_id);
create index if not exists poll_votes_option_id_idx on public.poll_votes(option_id);
create index if not exists poll_votes_user_id_idx on public.poll_votes(user_id);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "Polls are readable" on public.polls;
create policy "Polls are readable"
on public.polls
for select
using (true);

drop policy if exists "Authenticated users can create own polls" on public.polls;
create policy "Authenticated users can create own polls"
on public.polls
for insert
with check (auth.uid() = user_id);

drop policy if exists "Poll options are readable" on public.poll_options;
create policy "Poll options are readable"
on public.poll_options
for select
using (true);

drop policy if exists "Authenticated users can create options for own polls" on public.poll_options;
create policy "Authenticated users can create options for own polls"
on public.poll_options
for insert
with check (
  exists (
    select 1
    from public.polls p
    where p.id = poll_options.poll_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "Poll votes are readable" on public.poll_votes;
create policy "Poll votes are readable"
on public.poll_votes
for select
using (true);

drop policy if exists "Authenticated users can vote once" on public.poll_votes;
create policy "Authenticated users can vote once"
on public.poll_votes
for insert
with check (auth.uid() = user_id);

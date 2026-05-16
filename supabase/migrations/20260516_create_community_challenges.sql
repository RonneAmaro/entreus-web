-- Prepared migration for Community Challenges.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.community_challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text not null,
  rules text null,
  banner_url text null,
  status text not null default 'draft',
  selection_mode text not null default 'vote',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  voting_starts_at timestamptz null,
  voting_ends_at timestamptz null,
  max_entries_per_user integer default 1,
  highlight_until timestamptz null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint community_challenges_status_check
    check (status in ('draft', 'scheduled', 'active', 'voting', 'finished', 'archived')),
  constraint community_challenges_selection_mode_check
    check (selection_mode in ('admin', 'vote', 'hybrid')),
  constraint community_challenges_max_entries_check
    check (max_entries_per_user is null or max_entries_per_user > 0)
);

create table if not exists public.challenge_entries (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.community_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  caption text null,
  status text not null default 'submitted',
  rank integer null,
  selected_at timestamptz null,
  created_at timestamptz default now(),
  constraint challenge_entries_status_check
    check (status in ('submitted', 'approved', 'featured', 'winner', 'rejected')),
  constraint challenge_entries_unique_post
    unique (challenge_id, post_id)
);

create table if not exists public.challenge_votes (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.community_challenges(id) on delete cascade,
  entry_id uuid not null references public.challenge_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote_value smallint not null default 1 check (vote_value in (1)),
  created_at timestamptz default now(),
  constraint challenge_votes_unique_entry_user
    unique (entry_id, user_id)
);

create table if not exists public.feed_highlights (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  challenge_id uuid references public.community_challenges(id) on delete set null,
  title text null,
  description text null,
  position integer default 0,
  starts_at timestamptz default now(),
  ends_at timestamptz null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists community_challenges_status_idx
  on public.community_challenges(status);

create index if not exists community_challenges_slug_idx
  on public.community_challenges(slug);

create index if not exists challenge_entries_challenge_id_idx
  on public.challenge_entries(challenge_id);

create index if not exists challenge_entries_user_id_idx
  on public.challenge_entries(user_id);

create index if not exists challenge_entries_post_id_idx
  on public.challenge_entries(post_id);

create index if not exists challenge_votes_challenge_id_idx
  on public.challenge_votes(challenge_id);

create index if not exists challenge_votes_entry_id_idx
  on public.challenge_votes(entry_id);

create index if not exists challenge_votes_user_id_idx
  on public.challenge_votes(user_id);

create index if not exists feed_highlights_active_position_idx
  on public.feed_highlights(is_active, position, starts_at);

create or replace function public.set_community_challenges_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_community_challenges_updated_at
  on public.community_challenges;

create trigger set_community_challenges_updated_at
  before update on public.community_challenges
  for each row
  execute function public.set_community_challenges_updated_at();

alter table public.community_challenges enable row level security;
alter table public.challenge_entries enable row level security;
alter table public.challenge_votes enable row level security;
alter table public.feed_highlights enable row level security;

drop policy if exists "Authenticated users can read community challenges"
  on public.community_challenges;

create policy "Authenticated users can read community challenges"
  on public.community_challenges
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read challenge entries"
  on public.challenge_entries;

create policy "Authenticated users can read challenge entries"
  on public.challenge_entries
  for select
  to authenticated
  using (true);

drop policy if exists "Users can submit own active challenge entries"
  on public.challenge_entries;

create policy "Users can submit own active challenge entries"
  on public.challenge_entries
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'submitted'
    and rank is null
    and selected_at is null
    and exists (
      select 1
      from public.community_challenges challenge
      where challenge.id = challenge_id
        and challenge.status = 'active'
        and now() between challenge.starts_at and challenge.ends_at
    )
  );

drop policy if exists "Authenticated users can read challenge votes"
  on public.challenge_votes;

create policy "Authenticated users can read challenge votes"
  on public.challenge_votes
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can vote once on challenge entries"
  on public.challenge_votes;

create policy "Authenticated users can vote once on challenge entries"
  on public.challenge_votes
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and vote_value = 1
    and exists (
      select 1
      from public.community_challenges challenge
      where challenge.id = challenge_id
        and challenge.status in ('active', 'voting')
        and (
          challenge.voting_starts_at is null
          or now() >= challenge.voting_starts_at
        )
        and (
          challenge.voting_ends_at is null
          or now() <= challenge.voting_ends_at
        )
    )
  );

drop policy if exists "Users can remove own challenge votes"
  on public.challenge_votes;

create policy "Users can remove own challenge votes"
  on public.challenge_votes
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Authenticated users can read active feed highlights"
  on public.feed_highlights;

create policy "Authenticated users can read active feed highlights"
  on public.feed_highlights
  for select
  to authenticated
  using (
    is_active = true
    and (starts_at is null or now() >= starts_at)
    and (ends_at is null or now() <= ends_at)
  );

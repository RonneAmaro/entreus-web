-- Prepared migration for Community Suggestions.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.community_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null default 'feature',
  status text not null default 'open',
  admin_response text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint community_suggestions_category_check
    check (category in ('feature', 'content', 'design', 'meet', 'chat', 'badges', 'help', 'safety', 'other')),
  constraint community_suggestions_status_check
    check (status in ('open', 'under_review', 'planned', 'in_progress', 'released', 'declined'))
);

create table if not exists public.community_suggestion_votes (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.community_suggestions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote_value smallint not null check (vote_value in (-1, 1)),
  created_at timestamptz default now(),
  unique (suggestion_id, user_id)
);

create index if not exists community_suggestions_user_id_idx
  on public.community_suggestions(user_id);

create index if not exists community_suggestions_status_idx
  on public.community_suggestions(status);

create index if not exists community_suggestions_category_idx
  on public.community_suggestions(category);

create index if not exists community_suggestions_created_at_idx
  on public.community_suggestions(created_at);

create index if not exists community_suggestion_votes_suggestion_id_idx
  on public.community_suggestion_votes(suggestion_id);

create index if not exists community_suggestion_votes_user_id_idx
  on public.community_suggestion_votes(user_id);

create or replace function public.set_community_suggestions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_community_suggestions_updated_at
  on public.community_suggestions;

create trigger set_community_suggestions_updated_at
  before update on public.community_suggestions
  for each row
  execute function public.set_community_suggestions_updated_at();

alter table public.community_suggestions enable row level security;
alter table public.community_suggestion_votes enable row level security;

drop policy if exists "Authenticated users can read community suggestions"
  on public.community_suggestions;

create policy "Authenticated users can read community suggestions"
  on public.community_suggestions
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create own community suggestions"
  on public.community_suggestions;

create policy "Authenticated users can create own community suggestions"
  on public.community_suggestions
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'open'
    and admin_response is null
  );

drop policy if exists "Users can edit own open community suggestions"
  on public.community_suggestions;

create policy "Users can edit own open community suggestions"
  on public.community_suggestions
  for update
  to authenticated
  using (auth.uid() = user_id and status = 'open')
  with check (
    auth.uid() = user_id
    and status = 'open'
    and admin_response is null
  );

drop policy if exists "Authenticated users can read community suggestion votes"
  on public.community_suggestion_votes;

create policy "Authenticated users can read community suggestion votes"
  on public.community_suggestion_votes
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can vote on community suggestions"
  on public.community_suggestion_votes;

create policy "Authenticated users can vote on community suggestions"
  on public.community_suggestion_votes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own community suggestion vote"
  on public.community_suggestion_votes;

create policy "Users can update own community suggestion vote"
  on public.community_suggestion_votes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove own community suggestion vote"
  on public.community_suggestion_votes;

create policy "Users can remove own community suggestion vote"
  on public.community_suggestion_votes
  for delete
  to authenticated
  using (auth.uid() = user_id);

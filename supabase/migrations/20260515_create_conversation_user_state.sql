create table if not exists public.conversation_user_state (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cleared_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index if not exists conversation_user_state_user_id_idx
  on public.conversation_user_state(user_id);

create index if not exists conversation_user_state_conversation_id_idx
  on public.conversation_user_state(conversation_id);

create or replace function public.set_conversation_user_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_conversation_user_state_updated_at
  on public.conversation_user_state;

create trigger set_conversation_user_state_updated_at
  before update on public.conversation_user_state
  for each row
  execute function public.set_conversation_user_state_updated_at();

alter table public.conversation_user_state enable row level security;

drop policy if exists "Users can read their conversation state"
  on public.conversation_user_state;

create policy "Users can read their conversation state"
  on public.conversation_user_state
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their conversation state"
  on public.conversation_user_state;

create policy "Users can insert their conversation state"
  on public.conversation_user_state
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their conversation state"
  on public.conversation_user_state;

create policy "Users can update their conversation state"
  on public.conversation_user_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.conversation_user_state;
  end if;
exception
  when duplicate_object then
    null;
end;
$$;

alter table public.conversation_user_state
  add column if not exists deleted_at timestamptz;

create index if not exists conversation_user_state_deleted_at_idx
  on public.conversation_user_state(user_id, deleted_at);

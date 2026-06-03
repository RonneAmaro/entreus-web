create table if not exists public.meet_room_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.meet_rooms(id) on delete cascade,
  room_name text not null,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_identity text null,
  sender_name text not null,
  content text not null,
  type text not null default 'text',
  created_at timestamptz not null default now(),
  constraint meet_room_chat_messages_content_length_check
    check (char_length(trim(content)) between 1 and 500),
  constraint meet_room_chat_messages_type_check
    check (type in ('text'))
);

create index if not exists meet_room_chat_messages_room_created_at_idx
  on public.meet_room_chat_messages(room_id, created_at);

create index if not exists meet_room_chat_messages_room_name_created_at_idx
  on public.meet_room_chat_messages(room_name, created_at);

alter table public.meet_room_chat_messages enable row level security;

-- Access is intentionally mediated by server-side API routes that validate
-- meet_room_members approval before reading or writing chat history.

alter table public.messages
  add column if not exists reply_to_message_id uuid null references public.messages(id) on delete set null,
  add column if not exists edited_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id);

create index if not exists messages_reply_to_message_id_idx
  on public.messages(reply_to_message_id);

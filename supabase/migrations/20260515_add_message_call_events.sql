-- Prepared migration for private chat call history.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.messages
  add column if not exists type text not null default 'text',
  add column if not exists call_type text,
  add column if not exists call_status text,
  add column if not exists call_duration_seconds integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_type_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_type_check
      check (type in ('text', 'call'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_call_type_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_call_type_check
      check (call_type is null or call_type in ('voice', 'video'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_call_status_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_call_status_check
      check (call_status is null or call_status in ('missed', 'declined', 'ended', 'canceled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_call_duration_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_call_duration_check
      check (call_duration_seconds is null or call_duration_seconds >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_call_fields_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_call_fields_check
      check (
        (
          type = 'text'
          and call_type is null
          and call_status is null
          and call_duration_seconds is null
        )
        or
        (
          type = 'call'
          and call_type is not null
          and call_status is not null
        )
      );
  end if;
end $$;

create index if not exists messages_conversation_created_at_idx
  on public.messages(conversation_id, created_at);

create index if not exists messages_call_events_idx
  on public.messages(conversation_id, type, created_at)
  where type = 'call';

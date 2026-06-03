alter table public.meet_room_chat_messages
  add column if not exists attachment_name text null,
  add column if not exists attachment_path text null,
  add column if not exists attachment_mime_type text null,
  add column if not exists attachment_size integer null;

alter table public.meet_room_chat_messages
  drop constraint if exists meet_room_chat_messages_type_check;

alter table public.meet_room_chat_messages
  add constraint meet_room_chat_messages_type_check
    check (type in ('text', 'attachment'));

alter table public.meet_room_chat_messages
  add constraint meet_room_chat_messages_attachment_fields_check
    check (
      (
        type = 'text'
        and attachment_name is null
        and attachment_path is null
        and attachment_mime_type is null
        and attachment_size is null
      )
      or
      (
        type = 'attachment'
        and attachment_name is not null
        and attachment_path is not null
        and attachment_mime_type is not null
        and attachment_size is not null
        and attachment_size > 0
        and attachment_size <= 5242880
      )
    );

create index if not exists meet_room_chat_messages_attachment_path_idx
  on public.meet_room_chat_messages(attachment_path)
  where attachment_path is not null;

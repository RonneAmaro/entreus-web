create table if not exists public.private_message_attachment_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_provider text not null check (storage_provider in ('cloudflare-r2')),
  storage_bucket text not null,
  storage_key text not null,
  media_type text not null check (media_type in ('image', 'video', 'audio')),
  file_name text not null,
  declared_mime text not null,
  declared_size bigint not null check (declared_size > 0 and declared_size <= 52428800),
  position smallint not null check (position between 0 and 2),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cleanup_required')),
  expires_at timestamptz not null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists private_message_attachment_uploads_user_status_idx
  on public.private_message_attachment_uploads(user_id, status, expires_at);

create index if not exists private_message_attachment_uploads_message_idx
  on public.private_message_attachment_uploads(message_id, user_id);

alter table public.private_message_attachment_uploads
  add column if not exists position smallint not null default 0
    check (position between 0 and 2);

create unique index if not exists private_message_attachment_uploads_message_position_idx
  on public.private_message_attachment_uploads(message_id, position);

alter table public.private_message_attachment_uploads enable row level security;

drop policy if exists "Users can insert own pending private message uploads"
  on public.private_message_attachment_uploads;
drop policy if exists "Users can update own pending private message uploads"
  on public.private_message_attachment_uploads;

revoke all on table public.private_message_attachment_uploads from anon, authenticated;

alter table public.message_attachments
  add column if not exists needs_deeper_inspection boolean not null default false,
  add column if not exists file_content_unverified boolean not null default false;

alter table public.message_attachments enable row level security;

drop policy if exists "Participants can read private message attachments"
  on public.message_attachments;
create policy "Participants can read private message attachments"
  on public.message_attachments
  for select
  using (
    exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = message_attachments.conversation_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "Senders can insert own private message attachments"
  on public.message_attachments;
drop policy if exists "Senders can delete own private message attachments"
  on public.message_attachments;

revoke insert, update, delete on table public.message_attachments from anon, authenticated;

comment on table public.private_message_attachment_uploads is
  'Server-tracked pending uploads for private message attachments. Private R2 objects must be confirmed server-side before message_attachments metadata is trusted.';

comment on column public.message_attachments.needs_deeper_inspection is
  'True when container formats like mp4/webm/ogg were only shallowly checked during confirm.';

comment on column public.message_attachments.file_content_unverified is
  'True when shallow signature verification could not confidently confirm the uploaded content.';

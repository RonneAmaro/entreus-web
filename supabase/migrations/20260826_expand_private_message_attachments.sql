-- Expansion only. Review and apply manually before deploying the B1/B2 API clients.
-- The later contract migration must be based on a live audit of pg_policies and
-- information_schema.role_table_grants. It is intentionally not part of this package.

create table if not exists public.private_message_attachment_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_provider text not null default 'cloudflare-r2'
    check (storage_provider = 'cloudflare-r2'),
  storage_bucket text not null check (length(storage_bucket) between 1 and 255),
  storage_key text not null unique
    check (
      storage_key like 'private/messages/pending/%'
      and storage_key not like '%..%'
      and storage_key not like E'%\\%'
      and storage_key not like '%?%'
      and storage_key not like '%#%'
      and storage_key !~ '[[:cntrl:]]'
    ),
  final_storage_key text null unique
    check (
      final_storage_key is null
      or (
        final_storage_key like 'private/messages/final/%'
        and final_storage_key not like '%..%'
        and final_storage_key not like E'%\\%'
        and final_storage_key not like '%?%'
        and final_storage_key not like '%#%'
        and final_storage_key !~ '[[:cntrl:]]'
      )
    ),
  attachment_id uuid null references public.message_attachments(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'audio')),
  file_name text not null check (length(file_name) between 1 and 120),
  declared_mime text not null check (length(declared_mime) between 1 and 255),
  declared_size bigint not null check (declared_size between 1 and 52428800),
  position smallint not null check (position between 0 and 2),
  status text not null default 'pending'
    check (status in ('pending', 'confirming', 'confirmed', 'cleanup_required')),
  expires_at timestamptz not null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint private_message_attachment_uploads_lifecycle_check check (
    (
      status = 'pending'
      and final_storage_key is null
      and attachment_id is null
      and confirmed_at is null
    )
    or (
      status = 'confirming'
      and final_storage_key is not null
      and attachment_id is null
      and confirmed_at is null
    )
    or (
      status = 'confirmed'
      and final_storage_key is not null
      and attachment_id is not null
      and confirmed_at is not null
    )
    or (
      status = 'cleanup_required'
      and attachment_id is null
      and confirmed_at is null
    )
  )
);

create index if not exists private_message_attachment_uploads_user_status_idx
  on public.private_message_attachment_uploads(user_id, status, expires_at);

create index if not exists private_message_attachment_uploads_message_idx
  on public.private_message_attachment_uploads(message_id, user_id);

create unique index if not exists private_message_attachment_uploads_active_position_idx
  on public.private_message_attachment_uploads(message_id, position)
  where status in ('pending', 'confirming');

alter table public.private_message_attachment_uploads enable row level security;

-- Pending state is server-only. No browser role receives read or write access.
revoke all on table public.private_message_attachment_uploads from public, anon, authenticated;
grant select, insert, update, delete on table public.private_message_attachment_uploads to service_role;

-- Additive and backward-compatible with the current browser UI.
alter table public.message_attachments
  add column if not exists needs_deeper_inspection boolean not null default false;

comment on table public.private_message_attachment_uploads is
  'Server-only pending state for copy-validated private message attachments in R2.';

comment on column public.message_attachments.needs_deeper_inspection is
  'True only for a coherent MP4, WebM, or Ogg container that received shallow signature inspection.';

-- Deferred contract requirements after S1.6B2 and a live policy/grant audit:
-- 1. revoke legacy INSERT/UPDATE/DELETE on public.message_attachments from browser roles;
-- 2. replace reviewed SELECT policies with the canonical participant policy;
-- 3. add UNIQUE(message_id, position) only after preflight/deduplication proves compatibility.

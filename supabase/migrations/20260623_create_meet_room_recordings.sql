-- EntreUS Meet recording metadata. This migration intentionally stores only private
-- object metadata; no public recording URL is persisted.
-- Apply manually after provisioning LiveKit Egress and a dedicated private R2 bucket.

create table if not exists public.meet_room_recordings (
  id uuid primary key default gen_random_uuid(),
  room_name text not null,
  room_id uuid not null references public.meet_rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz,
  ended_at timestamptz,
  status text not null default 'preparing',
  recording_provider text,
  egress_id text unique,
  storage_provider text,
  storage_bucket text,
  storage_key text,
  file_size_bytes bigint,
  duration_seconds integer,
  error_message text,
  consent_notice_shown_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meet_room_recordings_status_check
    check (status in ('preparing', 'recording', 'processing', 'ready', 'failed', 'cancelled')),
  constraint meet_room_recordings_file_size_check
    check (file_size_bytes is null or file_size_bytes >= 0),
  constraint meet_room_recordings_duration_check
    check (duration_seconds is null or duration_seconds >= 0),
  constraint meet_room_recordings_storage_metadata_check
    check (
      storage_provider is null
      or (storage_provider = 'r2' and storage_bucket is not null and storage_key is not null)
    )
);

create index if not exists meet_room_recordings_room_created_at_idx
  on public.meet_room_recordings(room_id, created_at desc);

create index if not exists meet_room_recordings_egress_id_idx
  on public.meet_room_recordings(egress_id)
  where egress_id is not null;

create index if not exists meet_room_recordings_active_status_idx
  on public.meet_room_recordings(room_id, status, created_at desc)
  where status in ('preparing', 'recording', 'processing');

drop trigger if exists meet_room_recordings_set_updated_at on public.meet_room_recordings;
create trigger meet_room_recordings_set_updated_at
before update on public.meet_room_recordings
for each row execute function public.set_updated_at();

alter table public.meet_room_recordings enable row level security;

drop policy if exists "Recording creators and moderators can read Meet recordings" on public.meet_room_recordings;
create policy "Recording creators and moderators can read Meet recordings"
on public.meet_room_recordings
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.meet_rooms room
    where room.id = meet_room_recordings.room_id
      and room.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.meet_room_members member
    where member.room_id = meet_room_recordings.room_id
      and member.user_id = auth.uid()
      and member.status = 'approved'
      and member.role in ('owner', 'admin')
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'admin'
  )
);

-- There are deliberately no client-side insert or update policies. Recording state,
-- provider identifiers and private storage keys are written only by authenticated
-- server routes using the service-role client after host/admin, VIP and consent checks.
comment on table public.meet_room_recordings is
  'Sensitive Meet recording metadata. Objects remain in private R2; clients receive only authorized short-lived download URLs.';

-- EntreUS Meet Phase 1 transcription foundation.
-- Local-only migration: review and apply manually before deploying the application code.
-- Transcript text is private meeting data. Browser clients have no write policies.

create unique index if not exists meet_room_members_id_room_user_idx
  on public.meet_room_members(id, room_id, user_id);

create table if not exists public.meet_transcripts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.meet_rooms(id) on delete cascade,
  status text not null default 'pending_consent',
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  retention_expires_at timestamptz not null default (now() + interval '15 days'),
  language text,
  provider text,
  provider_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meet_transcripts_id_room_unique unique (id, room_id),
  constraint meet_transcripts_status_check
    check (status in ('pending_consent', 'ready', 'active', 'paused', 'ended', 'failed')),
  constraint meet_transcripts_retention_check
    check (retention_expires_at > created_at),
  constraint meet_transcripts_started_at_check
    check (started_at is null or started_at >= created_at),
  constraint meet_transcripts_ended_at_check
    check (
      ended_at is null
      or (
        ended_at >= created_at
        and (started_at is null or ended_at >= started_at)
      )
    ),
  constraint meet_transcripts_status_timestamps_check
    check (
      (status in ('pending_consent', 'ready') and ended_at is null)
      or (status in ('active', 'paused') and started_at is not null and ended_at is null)
      or (status in ('ended', 'failed') and ended_at is not null)
    )
);

create table if not exists public.meet_transcript_consents (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null,
  room_id uuid not null,
  member_id uuid not null,
  user_id uuid not null,
  livekit_participant_identity text not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meet_transcript_consents_transcript_room_fk
    foreign key (transcript_id, room_id)
    references public.meet_transcripts(id, room_id)
    on delete cascade,
  constraint meet_transcript_consents_member_room_user_fk
    foreign key (member_id, room_id, user_id)
    references public.meet_room_members(id, room_id, user_id)
    on delete cascade,
  constraint meet_transcript_consents_transcript_member_unique unique (transcript_id, member_id),
  constraint meet_transcript_consents_revocation_check
    check (revoked_at is null or accepted_at is null or revoked_at >= accepted_at)
);

create table if not exists public.meet_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null,
  room_id uuid not null,
  member_id uuid not null,
  user_id uuid not null,
  livekit_participant_identity text not null,
  source_track_sid text,
  speaker_display_name text,
  original_text text not null,
  language text,
  start_offset_ms bigint,
  end_offset_ms bigint,
  provider_segment_id text,
  created_at timestamptz not null default now(),
  constraint meet_transcript_segments_transcript_room_fk
    foreign key (transcript_id, room_id)
    references public.meet_transcripts(id, room_id)
    on delete cascade,
  constraint meet_transcript_segments_member_room_user_fk
    foreign key (member_id, room_id, user_id)
    references public.meet_room_members(id, room_id, user_id)
    on delete restrict,
  constraint meet_transcript_segments_text_check
    check (char_length(btrim(original_text)) between 1 and 4000),
  constraint meet_transcript_segments_offsets_check
    check (
      (start_offset_ms is null or start_offset_ms >= 0)
      and (end_offset_ms is null or end_offset_ms >= 0)
      and (start_offset_ms is null or end_offset_ms is null or end_offset_ms >= start_offset_ms)
    )
);

create unique index if not exists meet_transcripts_one_open_per_room_idx
  on public.meet_transcripts(room_id)
  where status in ('pending_consent', 'ready', 'active', 'paused');

create index if not exists meet_transcripts_room_created_idx
  on public.meet_transcripts(room_id, created_at desc);

create index if not exists meet_transcripts_retention_idx
  on public.meet_transcripts(retention_expires_at);

create index if not exists meet_transcript_consents_transcript_idx
  on public.meet_transcript_consents(transcript_id, created_at);

create index if not exists meet_transcript_consents_member_room_user_idx
  on public.meet_transcript_consents(member_id, room_id, user_id);

create index if not exists meet_transcript_segments_transcript_created_idx
  on public.meet_transcript_segments(transcript_id, created_at);

create index if not exists meet_transcript_segments_member_room_user_idx
  on public.meet_transcript_segments(member_id, room_id, user_id);

create unique index if not exists meet_transcript_segments_provider_segment_idx
  on public.meet_transcript_segments(transcript_id, provider_segment_id)
  where provider_segment_id is not null;

drop trigger if exists meet_transcripts_set_updated_at on public.meet_transcripts;
create trigger meet_transcripts_set_updated_at
before update on public.meet_transcripts
for each row execute function public.set_updated_at();

drop trigger if exists meet_transcript_consents_set_updated_at on public.meet_transcript_consents;
create trigger meet_transcript_consents_set_updated_at
before update on public.meet_transcript_consents
for each row execute function public.set_updated_at();

alter table public.meet_transcripts enable row level security;
alter table public.meet_transcript_consents enable row level security;
alter table public.meet_transcript_segments enable row level security;

drop policy if exists "Approved members can read Meet transcript sessions" on public.meet_transcripts;
create policy "Approved members can read Meet transcript sessions"
on public.meet_transcripts
for select
to authenticated
using (
  meet_transcripts.retention_expires_at > now()
  and
  exists (
    select 1
    from public.meet_room_members member
    where member.room_id = meet_transcripts.room_id
      and member.user_id = auth.uid()
      and member.status = 'approved'
  )
);

drop policy if exists "Approved members can read Meet transcript consents" on public.meet_transcript_consents;
create policy "Approved members can read Meet transcript consents"
on public.meet_transcript_consents
for select
to authenticated
using (
  exists (
    select 1
    from public.meet_transcripts transcript
    join public.meet_room_members member
      on member.room_id = transcript.room_id
    where transcript.id = meet_transcript_consents.transcript_id
      and transcript.room_id = meet_transcript_consents.room_id
      and transcript.retention_expires_at > now()
      and member.user_id = auth.uid()
      and member.status = 'approved'
  )
);

drop policy if exists "Approved members can read Meet transcript segments" on public.meet_transcript_segments;
create policy "Approved members can read Meet transcript segments"
on public.meet_transcript_segments
for select
to authenticated
using (
  exists (
    select 1
    from public.meet_transcripts transcript
    join public.meet_room_members member
      on member.room_id = transcript.room_id
    where transcript.id = meet_transcript_segments.transcript_id
      and transcript.room_id = meet_transcript_segments.room_id
      and transcript.retention_expires_at > now()
      and member.user_id = auth.uid()
      and member.status = 'approved'
  )
);

comment on table public.meet_transcripts is
  'Private transcription sessions for EntreUS Meet. Retention expiry requires a separate scheduled cleanup job.';

comment on table public.meet_transcript_consents is
  'Explicit transcription consent. Revocation ends the current Phase 1 session and is not recording consent.';

comment on table public.meet_transcript_segments is
  'Canonical original-language FINAL STT segments only. Raw audio and interim captions are never stored here.';

revoke all privileges on table public.meet_transcripts from anon, authenticated;
revoke all privileges on table public.meet_transcript_consents from anon, authenticated;
revoke all privileges on table public.meet_transcript_segments from anon, authenticated;

grant select on table public.meet_transcripts to authenticated;
grant select on table public.meet_transcript_consents to authenticated;
grant select on table public.meet_transcript_segments to authenticated;

-- Session, consent and segment writes require a trusted server/service role.
-- retention_expires_at blocks browser reads but does not physically delete rows;
-- trusted scheduled infrastructure must perform that separate cleanup.

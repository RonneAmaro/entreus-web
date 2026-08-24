alter table public.meet_rooms
  add column if not exists livekit_created_at timestamptz null;

comment on column public.meet_rooms.livekit_created_at is
  'First server-side confirmation that the corresponding LiveKit room existed.';

-- EntreUS Meet rooms and moderation foundation.
-- Server-side API routes should use SUPABASE_SERVICE_ROLE_KEY only on the server.
-- Never expose the service role key to client components or browser code.

create table if not exists public.meet_rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null unique,
  title text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  max_duration_minutes integer not null default 20,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  is_recording_enabled boolean not null default false,
  is_translation_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meet_rooms_plan_check check (plan in ('free', 'vip')),
  constraint meet_rooms_status_check check (status in ('active', 'expired', 'ended')),
  constraint meet_rooms_duration_check check (max_duration_minutes > 0)
);

create table if not exists public.meet_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.meet_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'participant',
  status text not null default 'pending',
  display_name text,
  hand_raised boolean not null default false,
  hand_raised_at timestamptz,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meet_room_members_role_check check (role in ('owner', 'admin', 'participant')),
  constraint meet_room_members_status_check check (status in ('pending', 'approved', 'rejected', 'left')),
  constraint meet_room_members_room_user_unique unique (room_id, user_id)
);

create index if not exists meet_rooms_room_name_idx on public.meet_rooms(room_name);
create index if not exists meet_rooms_owner_id_idx on public.meet_rooms(owner_id);
create index if not exists meet_rooms_status_idx on public.meet_rooms(status);
create index if not exists meet_rooms_expires_at_idx on public.meet_rooms(expires_at);

create index if not exists meet_room_members_room_id_idx on public.meet_room_members(room_id);
create index if not exists meet_room_members_user_id_idx on public.meet_room_members(user_id);
create index if not exists meet_room_members_status_idx on public.meet_room_members(status);
create index if not exists meet_room_members_hand_raised_idx on public.meet_room_members(hand_raised);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists meet_rooms_set_updated_at on public.meet_rooms;
create trigger meet_rooms_set_updated_at
before update on public.meet_rooms
for each row execute function public.set_updated_at();

drop trigger if exists meet_room_members_set_updated_at on public.meet_room_members;
create trigger meet_room_members_set_updated_at
before update on public.meet_room_members
for each row execute function public.set_updated_at();

alter table public.meet_rooms enable row level security;
alter table public.meet_room_members enable row level security;

drop policy if exists "Users can read owned or joined meet rooms" on public.meet_rooms;
create policy "Users can read owned or joined meet rooms"
on public.meet_rooms
for select
to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.meet_room_members m
    where m.room_id = meet_rooms.id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "Users can read own meet membership" on public.meet_room_members;
create policy "Users can read own meet membership"
on public.meet_room_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Room owners and admins can read room memberships" on public.meet_room_members;
create policy "Room owners and admins can read room memberships"
on public.meet_room_members
for select
to authenticated
using (
  exists (
    select 1
    from public.meet_room_members current_member
    where current_member.room_id = meet_room_members.room_id
      and current_member.user_id = auth.uid()
      and current_member.role in ('owner', 'admin')
      and current_member.status = 'approved'
  )
);

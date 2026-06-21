-- Apply manually. No financial data or documents are stored.
create table if not exists public.creator_interest_requests (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null, name text not null, email text not null,
  creator_name text, category text not null, social_link text, audience_size text, message text not null,
  has_adult_content_interest boolean not null default false, status text not null default 'pending',
  admin_notes text, reviewed_at timestamptz, reviewed_by uuid references auth.users(id),
  constraint creator_interest_status_check check (status in ('pending','reviewing','approved_contact','rejected','archived'))
);
alter table public.creator_interest_requests enable row level security;
create policy "Public can create creator interest" on public.creator_interest_requests for insert with check (char_length(name) between 1 and 120 and char_length(email) between 3 and 254 and char_length(message) between 1 and 1200);
create policy "Admins manage creator interest" on public.creator_interest_requests for all using (public.is_admin()) with check (public.is_admin());

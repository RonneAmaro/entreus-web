-- Prepared migration for Admin Badges 1: manual user badge management.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  title text null,
  description text null,
  icon text null,
  color text not null default '#3b82f6',
  rarity text not null default 'especial',
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  awarded_by uuid null references auth.users(id) on delete set null,
  reason text null,
  constraint user_badges_user_badge_unique unique (user_id, badge_id)
);

create table if not exists public.user_badge_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id uuid null references public.badges(id) on delete set null,
  badge_slug text not null,
  action text not null,
  admin_id uuid null references auth.users(id) on delete set null,
  reason text null,
  created_at timestamptz not null default now(),
  constraint user_badge_audit_logs_action_check check (action in ('granted', 'revoked'))
);

create index if not exists user_badges_user_id_awarded_at_idx
  on public.user_badges(user_id, awarded_at);

create index if not exists user_badge_audit_logs_user_created_at_idx
  on public.user_badge_audit_logs(user_id, created_at desc);

insert into public.badges (slug, name, title, description, icon, color, rarity)
values
  (
    'community',
    'Comunidade',
    'Selo Comunidade',
    'Reconhecimento manual para usuarios participativos que ajudam a manter a comunidade viva, util e acolhedora.',
    '/badges/comunidade.png',
    '#38bdf8',
    'comunidade'
  ),
  (
    'elder',
    'Anciao',
    'Selo Anciao',
    'Reconhecimento manual para membros fundadores e vozes especiais da comunidade.',
    '/badges/anciao.png',
    '#f59e0b',
    'lendario'
  ),
  (
    'vip',
    'VIP',
    'Selo VIP',
    'Identidade premium concedida manualmente pela administracao.',
    '/badges/vip-premium.png',
    '#60a5fa',
    'premium'
  ),
  (
    'vip_premium',
    'VIP Premium',
    'Selo VIP Premium',
    'Reconhecimento premium especial concedido manualmente pela administracao.',
    '/badges/vip-premium.png',
    '#a855f7',
    'premium'
  )
on conflict (slug) do update
set
  name = excluded.name,
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  color = excluded.color,
  rarity = excluded.rarity;

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.user_badge_audit_logs enable row level security;

drop policy if exists "Anyone can read badges" on public.badges;
create policy "Anyone can read badges"
  on public.badges
  for select
  using (true);

drop policy if exists "Anyone can read user badges" on public.user_badges;
create policy "Anyone can read user badges"
  on public.user_badges
  for select
  using (true);

drop policy if exists "Admins can manage user badges" on public.user_badges;
create policy "Admins can manage user badges"
  on public.user_badges
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can read badge audit logs" on public.user_badge_audit_logs;
create policy "Admins can read badge audit logs"
  on public.user_badge_audit_logs
  for select
  using (public.is_admin());

drop policy if exists "Admins can insert badge audit logs" on public.user_badge_audit_logs;
create policy "Admins can insert badge audit logs"
  on public.user_badge_audit_logs
  for insert
  with check (public.is_admin());

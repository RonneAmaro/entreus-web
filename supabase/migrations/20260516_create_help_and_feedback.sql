-- Prepared migration for Help Center and internal feedback.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.help_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  icon_name text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.help_categories(id) on delete set null,
  slug text not null unique,
  title text not null,
  summary text,
  content text,
  tags text[] not null default '{}',
  is_popular boolean not null default false,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.internal_feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null,
  urgency text not null default 'normal',
  title text not null,
  description text not null,
  page_url text,
  screenshot_url text,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_feedback_reports_type_check
    check (type in ('bug', 'feedback', 'idea', 'content', 'safety', 'other')),
  constraint internal_feedback_reports_urgency_check
    check (urgency in ('low', 'normal', 'high', 'urgent')),
  constraint internal_feedback_reports_status_check
    check (status in ('open', 'triaged', 'in_progress', 'resolved', 'closed'))
);

create index if not exists help_categories_published_order_idx
  on public.help_categories(is_published, sort_order, title);

create index if not exists help_articles_category_order_idx
  on public.help_articles(category_id, is_published, sort_order, title);

create index if not exists help_articles_popular_idx
  on public.help_articles(is_popular, is_published, sort_order, title)
  where is_popular = true;

create index if not exists internal_feedback_reports_user_created_at_idx
  on public.internal_feedback_reports(user_id, created_at desc);

create index if not exists internal_feedback_reports_status_created_at_idx
  on public.internal_feedback_reports(status, created_at desc);

create or replace function public.set_help_support_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_help_categories_updated_at on public.help_categories;
create trigger set_help_categories_updated_at
  before update on public.help_categories
  for each row
  execute function public.set_help_support_updated_at();

drop trigger if exists set_help_articles_updated_at on public.help_articles;
create trigger set_help_articles_updated_at
  before update on public.help_articles
  for each row
  execute function public.set_help_support_updated_at();

drop trigger if exists set_internal_feedback_reports_updated_at on public.internal_feedback_reports;
create trigger set_internal_feedback_reports_updated_at
  before update on public.internal_feedback_reports
  for each row
  execute function public.set_help_support_updated_at();

alter table public.help_categories enable row level security;
alter table public.help_articles enable row level security;
alter table public.internal_feedback_reports enable row level security;

drop policy if exists "Published help categories are readable"
  on public.help_categories;

create policy "Published help categories are readable"
  on public.help_categories
  for select
  using (is_published = true);

drop policy if exists "Published help articles are readable"
  on public.help_articles;

create policy "Published help articles are readable"
  on public.help_articles
  for select
  using (is_published = true);

drop policy if exists "Users can create feedback reports"
  on public.internal_feedback_reports;

create policy "Users can create feedback reports"
  on public.internal_feedback_reports
  for insert
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can read their own feedback reports"
  on public.internal_feedback_reports;

create policy "Users can read their own feedback reports"
  on public.internal_feedback_reports
  for select
  using (auth.uid() = user_id);

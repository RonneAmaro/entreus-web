-- Prepared migration for Package 47: admin finance records.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.admin_financial_records (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  category text not null,
  description text not null,
  amount_cents integer not null,
  currency text not null default 'BRL',
  occurred_on date not null default current_date,
  payment_method text null,
  reference_type text null,
  reference_id uuid null,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_financial_records_kind_check
    check (kind in ('income', 'expense')),
  constraint admin_financial_records_amount_check
    check (amount_cents > 0),
  constraint admin_financial_records_currency_check
    check (currency in ('BRL')),
  constraint admin_financial_records_category_check
    check (
      (
        kind = 'income'
        and category in ('itacash_sale', 'vip_sale', 'manual_income', 'other_income')
      )
      or (
        kind = 'expense'
        and category in (
          'creator_payout',
          'server',
          'domain',
          'tool',
          'marketing',
          'tax',
          'developer_salary',
          'manual_expense',
          'other_expense'
        )
      )
    )
);

create index if not exists admin_financial_records_occurred_on_idx
  on public.admin_financial_records(occurred_on desc);

create index if not exists admin_financial_records_kind_category_idx
  on public.admin_financial_records(kind, category);

create index if not exists admin_financial_records_created_by_idx
  on public.admin_financial_records(created_by, created_at desc);

create or replace function public.set_admin_financial_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_financial_records_updated_at
  on public.admin_financial_records;

create trigger set_admin_financial_records_updated_at
  before update on public.admin_financial_records
  for each row
  execute function public.set_admin_financial_records_updated_at();

alter table public.admin_financial_records enable row level security;

revoke all on table public.admin_financial_records from public;
revoke all on table public.admin_financial_records from anon;
revoke all on table public.admin_financial_records from authenticated;

grant select, insert, update, delete on table public.admin_financial_records to authenticated;

drop policy if exists "Admins can read financial records"
  on public.admin_financial_records;

create policy "Admins can read financial records"
  on public.admin_financial_records
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can insert financial records"
  on public.admin_financial_records;

create policy "Admins can insert financial records"
  on public.admin_financial_records
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update financial records"
  on public.admin_financial_records;

create policy "Admins can update financial records"
  on public.admin_financial_records
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete financial records"
  on public.admin_financial_records;

create policy "Admins can delete financial records"
  on public.admin_financial_records
  for delete
  to authenticated
  using (public.is_admin());

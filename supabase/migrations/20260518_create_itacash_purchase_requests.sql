-- Prepared migration for manual ItaCash purchase requests.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.itacash_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_itacash integer not null,
  base_amount_brl_cents integer not null,
  platform_fee_percent numeric not null default 2,
  platform_fee_brl_cents integer not null,
  operator_fee_percent numeric not null default 0,
  operator_fee_brl_cents integer not null default 0,
  total_brl_cents integer not null,
  payment_method text not null default 'pix_manual',
  status text not null default 'pending',
  user_note text null,
  payment_reference text null,
  proof_url text null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  admin_notes text null,
  rejection_reason text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.itacash_purchase_requests
  add column if not exists base_amount_brl_cents integer,
  add column if not exists platform_fee_percent numeric not null default 2,
  add column if not exists platform_fee_brl_cents integer,
  add column if not exists operator_fee_percent numeric not null default 0,
  add column if not exists operator_fee_brl_cents integer not null default 0,
  add column if not exists total_brl_cents integer,
  add column if not exists user_note text null,
  add column if not exists payment_reference text null,
  add column if not exists proof_url text null,
  add column if not exists reviewed_by uuid null references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists admin_notes text null,
  add column if not exists rejection_reason text null;

alter table public.itacash_purchase_requests
  alter column payment_method set default 'pix_manual',
  alter column status set default 'pending';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'itacash_purchase_requests'
      and column_name = 'amount_brl'
  ) then
    alter table public.itacash_purchase_requests
      alter column amount_brl drop not null;
  end if;
end $$;

update public.itacash_purchase_requests
set
  base_amount_brl_cents = coalesce(
    base_amount_brl_cents,
    case
      when amount_itacash is not null then amount_itacash * 10
      else null
    end
  ),
  platform_fee_brl_cents = coalesce(
    platform_fee_brl_cents,
    ceil(coalesce(amount_itacash, 0) * 10 * 0.02)::integer
  ),
  operator_fee_brl_cents = coalesce(operator_fee_brl_cents, 0),
  total_brl_cents = coalesce(
    total_brl_cents,
    (coalesce(amount_itacash, 0) * 10) + ceil(coalesce(amount_itacash, 0) * 10 * 0.02)::integer
  ),
  payment_method = case
    when payment_method in ('pix_manual', 'mercadopago_manual') then payment_method
    else 'pix_manual'
  end,
  status = case
    when status in ('pending', 'approved', 'rejected', 'canceled') then status
    when status = 'paid' then 'approved'
    when status = 'failed' then 'rejected'
    else 'pending'
  end;

alter table public.itacash_purchase_requests
  alter column payment_method set not null,
  alter column status set not null,
  alter column base_amount_brl_cents set not null,
  alter column platform_fee_brl_cents set not null,
  alter column total_brl_cents set not null;

do $$
begin
  alter table public.itacash_purchase_requests
    drop constraint if exists itacash_purchase_requests_amount_check;

  alter table public.itacash_purchase_requests
    add constraint itacash_purchase_requests_amount_check
    check (
      amount_itacash > 0
      and base_amount_brl_cents > 0
      and platform_fee_brl_cents >= 0
      and operator_fee_brl_cents >= 0
      and total_brl_cents = base_amount_brl_cents + platform_fee_brl_cents + operator_fee_brl_cents
    );

  alter table public.itacash_purchase_requests
    drop constraint if exists itacash_purchase_requests_status_check;

  alter table public.itacash_purchase_requests
    add constraint itacash_purchase_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'canceled'));

  alter table public.itacash_purchase_requests
    drop constraint if exists itacash_purchase_requests_payment_method_check;

  alter table public.itacash_purchase_requests
    add constraint itacash_purchase_requests_payment_method_check
    check (payment_method in ('pix_manual', 'mercadopago_manual'));
end $$;

create index if not exists itacash_purchase_requests_user_created_at_idx
  on public.itacash_purchase_requests(user_id, created_at desc);

create index if not exists itacash_purchase_requests_status_created_at_idx
  on public.itacash_purchase_requests(status, created_at desc);

drop trigger if exists set_itacash_purchase_requests_updated_at
  on public.itacash_purchase_requests;

create trigger set_itacash_purchase_requests_updated_at
  before update on public.itacash_purchase_requests
  for each row
  execute function public.set_itacash_updated_at();

alter table public.itacash_purchase_requests enable row level security;

drop policy if exists "Users can create own ItaCash purchase requests"
  on public.itacash_purchase_requests;

create policy "Users can create own ItaCash purchase requests"
  on public.itacash_purchase_requests
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists "Users can read own ItaCash purchase requests"
  on public.itacash_purchase_requests;

create policy "Users can read own ItaCash purchase requests"
  on public.itacash_purchase_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can read ItaCash purchase requests"
  on public.itacash_purchase_requests;

create policy "Admins can read ItaCash purchase requests"
  on public.itacash_purchase_requests
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update ItaCash purchase requests"
  on public.itacash_purchase_requests;

create policy "Admins can update ItaCash purchase requests"
  on public.itacash_purchase_requests
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can read ItaCash wallets"
  on public.itacash_wallets;

create policy "Admins can read ItaCash wallets"
  on public.itacash_wallets
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can read ItaCash transactions"
  on public.itacash_transactions;

create policy "Admins can read ItaCash transactions"
  on public.itacash_transactions
  for select
  to authenticated
  using (public.is_admin());

do $$
begin
  alter table public.itacash_transactions
    drop constraint if exists itacash_transactions_type_check;

  alter table public.itacash_transactions
    add constraint itacash_transactions_type_check
    check (type in (
      'admin_credit',
      'reward',
      'gift_sent',
      'gift_received',
      'tip_sent',
      'tip_received',
      'purchase_confirmed',
      'refund',
      'adjustment'
    ));
end $$;

create or replace function public.approve_itacash_purchase_request(
  p_request_id uuid,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_request public.itacash_purchase_requests;
  v_wallet public.itacash_wallets;
  v_balance_after integer;
  v_reviewed_at timestamptz := now();
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  select *
  into v_request
  from public.itacash_purchase_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Purchase request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending purchase requests can be approved';
  end if;

  insert into public.itacash_wallets (user_id)
  values (v_request.user_id)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from public.itacash_wallets
  where user_id = v_request.user_id
  for update;

  v_balance_after := v_wallet.balance + v_request.amount_itacash;

  update public.itacash_wallets
  set balance = v_balance_after
  where id = v_wallet.id;

  insert into public.itacash_transactions (
    wallet_id,
    user_id,
    type,
    amount,
    balance_after,
    description,
    reference_type,
    reference_id,
    metadata
  )
  values (
    v_wallet.id,
    v_request.user_id,
    'purchase_confirmed',
    v_request.amount_itacash,
    v_balance_after,
    'Compra manual de ItaCash confirmada',
    'itacash_purchase_request',
    v_request.id,
    jsonb_build_object(
      'payment_method', v_request.payment_method,
      'base_amount_brl_cents', v_request.base_amount_brl_cents,
      'platform_fee_brl_cents', v_request.platform_fee_brl_cents,
      'operator_fee_brl_cents', v_request.operator_fee_brl_cents,
      'total_brl_cents', v_request.total_brl_cents
    )
  );

  update public.itacash_purchase_requests
  set
    status = 'approved',
    reviewed_by = v_admin_id,
    reviewed_at = v_reviewed_at,
    admin_notes = nullif(trim(p_admin_notes), ''),
    rejection_reason = null
  where id = v_request.id;

  return jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'wallet_id', v_wallet.id,
    'balance_after', v_balance_after
  );
end;
$$;

create or replace function public.reject_itacash_purchase_request(
  p_request_id uuid,
  p_rejection_reason text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_request public.itacash_purchase_requests;
  v_reason text := nullif(trim(p_rejection_reason), '');
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  if v_reason is null then
    raise exception 'Rejection reason is required';
  end if;

  select *
  into v_request
  from public.itacash_purchase_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Purchase request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending purchase requests can be rejected';
  end if;

  update public.itacash_purchase_requests
  set
    status = 'rejected',
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    admin_notes = nullif(trim(p_admin_notes), ''),
    rejection_reason = v_reason
  where id = v_request.id;

  return jsonb_build_object('success', true, 'request_id', v_request.id);
end;
$$;

grant execute on function public.approve_itacash_purchase_request(uuid, text) to authenticated;
grant execute on function public.reject_itacash_purchase_request(uuid, text, text) to authenticated;

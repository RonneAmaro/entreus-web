-- Prepared migration for VIP Plus and Mercado Pago payment orders.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.profiles
  add column if not exists vip_plan text null,
  add column if not exists vip_status text default 'inactive',
  add column if not exists vip_started_at timestamptz null,
  add column if not exists vip_expires_at timestamptz null,
  add column if not exists vip_plus_badge_enabled boolean default false;

do $$
begin
  alter table public.profiles
    drop constraint if exists profiles_vip_status_check;

  alter table public.profiles
    add constraint profiles_vip_status_check
    check (vip_status in ('inactive', 'pending', 'active', 'expired', 'canceled'));
end $$;

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_type text not null,
  product_id text null,
  amount_itacash integer null,
  base_amount_brl_cents integer not null,
  platform_fee_percent numeric not null default 2,
  platform_fee_brl_cents integer not null,
  operator_fee_percent numeric not null default 0,
  operator_fee_brl_cents integer not null default 0,
  total_brl_cents integer not null,
  provider text not null default 'mercadopago',
  provider_payment_id text null,
  provider_preference_id text null,
  provider_init_point text null,
  external_reference text unique not null,
  status text not null default 'pending',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint payment_orders_product_type_check check (product_type in ('itacash', 'vip_plus')),
  constraint payment_orders_status_check check (status in ('pending', 'paid', 'failed', 'canceled', 'expired')),
  constraint payment_orders_amount_check check (
    base_amount_brl_cents > 0
    and platform_fee_brl_cents >= 0
    and operator_fee_brl_cents >= 0
    and total_brl_cents = base_amount_brl_cents + platform_fee_brl_cents + operator_fee_brl_cents
    and (
      (product_type = 'itacash' and amount_itacash is not null and amount_itacash > 0)
      or (product_type = 'vip_plus')
    )
  )
);

create index if not exists payment_orders_user_created_at_idx
  on public.payment_orders(user_id, created_at desc);

create index if not exists payment_orders_status_created_at_idx
  on public.payment_orders(status, created_at desc);

create index if not exists payment_orders_provider_payment_id_idx
  on public.payment_orders(provider_payment_id);

drop trigger if exists set_payment_orders_updated_at
  on public.payment_orders;

create trigger set_payment_orders_updated_at
  before update on public.payment_orders
  for each row
  execute function public.set_itacash_updated_at();

alter table public.payment_orders enable row level security;

drop policy if exists "Users can read own payment orders"
  on public.payment_orders;

create policy "Users can read own payment orders"
  on public.payment_orders
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can read payment orders"
  on public.payment_orders;

create policy "Admins can read payment orders"
  on public.payment_orders
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

create or replace function public.create_payment_order(
  p_product_type text,
  p_product_id text,
  p_amount_itacash integer,
  p_base_amount_brl_cents integer,
  p_platform_fee_percent numeric,
  p_platform_fee_brl_cents integer,
  p_operator_fee_percent numeric,
  p_operator_fee_brl_cents integer,
  p_total_brl_cents integer,
  p_metadata jsonb default '{}'::jsonb
)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.payment_orders;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_product_type not in ('itacash', 'vip_plus') then
    raise exception 'Invalid product type';
  end if;

  if p_base_amount_brl_cents <= 0 or p_total_brl_cents <= 0 then
    raise exception 'Invalid payment amount';
  end if;

  if p_platform_fee_brl_cents < 0 or p_operator_fee_brl_cents < 0 then
    raise exception 'Invalid fee amount';
  end if;

  if p_total_brl_cents <> p_base_amount_brl_cents + p_platform_fee_brl_cents + p_operator_fee_brl_cents then
    raise exception 'Invalid payment total';
  end if;

  if p_product_type = 'itacash' and (p_amount_itacash is null or p_amount_itacash <= 0) then
    raise exception 'Invalid ItaCash amount';
  end if;

  insert into public.payment_orders (
    user_id,
    product_type,
    product_id,
    amount_itacash,
    base_amount_brl_cents,
    platform_fee_percent,
    platform_fee_brl_cents,
    operator_fee_percent,
    operator_fee_brl_cents,
    total_brl_cents,
    provider,
    external_reference,
    status,
    metadata
  )
  values (
    v_user_id,
    p_product_type,
    p_product_id,
    p_amount_itacash,
    p_base_amount_brl_cents,
    p_platform_fee_percent,
    p_platform_fee_brl_cents,
    p_operator_fee_percent,
    p_operator_fee_brl_cents,
    p_total_brl_cents,
    'mercadopago',
    'entreus_' || replace(gen_random_uuid()::text, '-', ''),
    'pending',
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.attach_mercadopago_preference(
  p_order_id uuid,
  p_provider_preference_id text,
  p_provider_init_point text
)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.payment_orders;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.payment_orders
  set
    provider_preference_id = nullif(trim(p_provider_preference_id), ''),
    provider_init_point = nullif(trim(p_provider_init_point), '')
  where id = p_order_id
    and user_id = v_user_id
    and status = 'pending'
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Payment order not found';
  end if;

  return v_order;
end;
$$;

create or replace function public.complete_mercadopago_payment_order(
  p_external_reference text,
  p_provider_payment_id text,
  p_provider_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.payment_orders;
  v_wallet public.itacash_wallets;
  v_balance_after integer;
  v_transaction_id uuid;
  v_bonus_itacash integer := 100;
begin
  select *
  into v_order
  from public.payment_orders
  where external_reference = p_external_reference
  for update;

  if v_order.id is null then
    raise exception 'Payment order not found';
  end if;

  if v_order.status = 'paid' then
    return jsonb_build_object('success', true, 'already_processed', true, 'order_id', v_order.id);
  end if;

  if p_provider_status <> 'approved' then
    update public.payment_orders
    set
      status = case
        when p_provider_status in ('cancelled', 'canceled') then 'canceled'
        when p_provider_status = 'expired' then 'expired'
        else 'failed'
      end,
      provider_payment_id = p_provider_payment_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('provider_status', p_provider_status)
    where id = v_order.id;

    return jsonb_build_object('success', true, 'paid', false, 'order_id', v_order.id);
  end if;

  update public.payment_orders
  set
    status = 'paid',
    provider_payment_id = p_provider_payment_id,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('provider_status', p_provider_status, 'paid_at', now())
  where id = v_order.id;

  if v_order.product_type = 'itacash' then
    insert into public.itacash_wallets (user_id)
    values (v_order.user_id)
    on conflict (user_id) do nothing;

    select *
    into v_wallet
    from public.itacash_wallets
    where user_id = v_order.user_id
    for update;

    v_balance_after := v_wallet.balance + coalesce(v_order.amount_itacash, 0);

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
      v_order.user_id,
      'purchase_confirmed',
      coalesce(v_order.amount_itacash, 0),
      v_balance_after,
      'Compra automatica de ItaCash confirmada',
      'payment_order',
      v_order.id,
      jsonb_build_object(
        'provider', 'mercadopago',
        'provider_payment_id', p_provider_payment_id,
        'total_brl_cents', v_order.total_brl_cents
      )
    );
  elsif v_order.product_type = 'vip_plus' then
    update public.profiles
    set
      vip_plan = 'plus',
      vip_status = 'active',
      vip_started_at = now(),
      vip_expires_at = now() + interval '30 days',
      vip_plus_badge_enabled = true
    where id = v_order.user_id;

    insert into public.itacash_wallets (user_id)
    values (v_order.user_id)
    on conflict (user_id) do nothing;

    select *
    into v_wallet
    from public.itacash_wallets
    where user_id = v_order.user_id
    for update;

    v_balance_after := v_wallet.balance + v_bonus_itacash;

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
      v_order.user_id,
      'admin_credit',
      v_bonus_itacash,
      v_balance_after,
      'Bonus inicial VIP Plus',
      'payment_order',
      v_order.id,
      jsonb_build_object(
        'vip_plus_bonus', true,
        'withdrawable', false,
        'provider', 'mercadopago',
        'provider_payment_id', p_provider_payment_id
      )
    )
    returning id into v_transaction_id;
  end if;

  return jsonb_build_object('success', true, 'paid', true, 'order_id', v_order.id);
end;
$$;

grant execute on function public.create_payment_order(text, text, integer, integer, numeric, integer, numeric, integer, integer, jsonb) to authenticated;
grant execute on function public.attach_mercadopago_preference(uuid, text, text) to authenticated;
grant execute on function public.complete_mercadopago_payment_order(text, text, text) to service_role;

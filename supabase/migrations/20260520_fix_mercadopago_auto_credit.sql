-- Harden Mercado Pago approved payment processing and automatic ItaCash credit.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.payment_orders
  add column if not exists provider_status text null,
  add column if not exists provider_payment_method text null,
  add column if not exists pix_qr_code text null,
  add column if not exists pix_qr_code_base64 text null,
  add column if not exists pix_ticket_url text null,
  add column if not exists expires_at timestamptz null,
  add column if not exists paid_at timestamptz null,
  add column if not exists processed_at timestamptz null;

create index if not exists payment_orders_provider_preference_id_idx
  on public.payment_orders(provider_preference_id);

create or replace function public.complete_mercadopago_payment_order_v2(
  p_provider_payment_id text,
  p_provider_status text,
  p_external_reference text default null,
  p_order_id uuid default null,
  p_provider_preference_id text default null,
  p_provider_payment_method text default null
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
  v_bonus_itacash integer := 100;
  v_status text := coalesce(nullif(trim(p_provider_status), ''), 'unknown');
  v_payment_id text := nullif(trim(p_provider_payment_id), '');
  v_payment_method text := nullif(trim(p_provider_payment_method), '');
begin
  select *
  into v_order
  from public.payment_orders
  where (
    (p_external_reference is not null and external_reference = p_external_reference)
    or (p_order_id is not null and id = p_order_id)
    or (p_provider_preference_id is not null and provider_preference_id = p_provider_preference_id)
    or (v_payment_id is not null and provider_payment_id = v_payment_id)
  )
  order by created_at desc
  limit 1
  for update;

  if v_order.id is null then
    raise exception 'Payment order not found';
  end if;

  if v_order.status = 'paid' or v_order.processed_at is not null then
    update public.payment_orders
    set
      provider_payment_id = coalesce(v_payment_id, provider_payment_id),
      provider_status = v_status,
      provider_payment_method = coalesce(v_payment_method, provider_payment_method),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_status', v_status,
        'last_webhook_at', now()
      )
    where id = v_order.id;

    return jsonb_build_object('success', true, 'already_processed', true, 'order_id', v_order.id);
  end if;

  if v_status <> 'approved' then
    update public.payment_orders
    set
      status = case
        when v_status in ('pending', 'in_process', 'authorized') then 'pending'
        when v_status in ('cancelled', 'canceled') then 'canceled'
        when v_status = 'expired' then 'expired'
        else 'failed'
      end,
      provider_payment_id = coalesce(v_payment_id, provider_payment_id),
      provider_status = v_status,
      provider_payment_method = coalesce(v_payment_method, provider_payment_method),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_status', v_status,
        'last_webhook_at', now()
      )
    where id = v_order.id;

    return jsonb_build_object('success', true, 'paid', false, 'order_id', v_order.id, 'provider_status', v_status);
  end if;

  update public.payment_orders
  set
    status = 'paid',
    provider_payment_id = coalesce(v_payment_id, provider_payment_id),
    provider_status = v_status,
    provider_payment_method = coalesce(v_payment_method, provider_payment_method),
    paid_at = coalesce(paid_at, now()),
    processed_at = coalesce(processed_at, now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'provider_status', v_status,
      'paid_at', now(),
      'last_webhook_at', now()
    )
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
      'Compra Mercado Pago de ItaCash confirmada',
      'payment_order',
      v_order.id,
      jsonb_build_object(
        'provider', 'mercadopago',
        'provider_payment_id', coalesce(v_payment_id, v_order.provider_payment_id),
        'payment_method', coalesce(v_payment_method, v_order.provider_payment_method),
        'external_reference', v_order.external_reference,
        'total_brl_cents', v_order.total_brl_cents
      )
    );

    insert into public.notifications (
      user_id,
      actor_id,
      type,
      amount
    )
    values (
      v_order.user_id,
      null,
      'itacash_purchase_approved',
      coalesce(v_order.amount_itacash, 0)
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
        'provider_payment_id', coalesce(v_payment_id, v_order.provider_payment_id)
      )
    );
  end if;

  return jsonb_build_object('success', true, 'paid', true, 'order_id', v_order.id);
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
begin
  return public.complete_mercadopago_payment_order_v2(
    p_provider_payment_id,
    p_provider_status,
    p_external_reference,
    null,
    null,
    null
  );
end;
$$;

grant execute on function public.complete_mercadopago_payment_order_v2(text, text, text, uuid, text, text) to service_role;
grant execute on function public.complete_mercadopago_payment_order(text, text, text) to service_role;

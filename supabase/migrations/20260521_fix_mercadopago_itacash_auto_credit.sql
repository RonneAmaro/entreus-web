-- Fix Mercado Pago approved payment processing so ItaCash is credited idempotently.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create or replace function public.complete_mercadopago_payment_order_v2(
  p_provider_payment_id text,
  p_provider_status text,
  p_external_reference text default null,
  p_metadata jsonb default '{}'::jsonb
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
  v_status text := coalesce(nullif(trim(p_provider_status), ''), 'unknown');
  v_payment_id text := nullif(trim(p_provider_payment_id), '');
  v_external_reference text := nullif(trim(p_external_reference), '');
  v_payment_method text := nullif(trim(p_metadata->>'provider_payment_method'), '');
  v_has_purchase_credit boolean := false;
begin
  select *
  into v_order
  from public.payment_orders
  where (
    (v_external_reference is not null and external_reference = v_external_reference)
    or (v_payment_id is not null and provider_payment_id = v_payment_id)
    or (v_external_reference is not null and id::text = v_external_reference)
  )
  order by created_at desc
  limit 1
  for update;

  if v_order.id is null then
    raise exception 'Payment order not found';
  end if;

  select exists (
    select 1
    from public.itacash_transactions
    where reference_type = 'payment_order'
      and reference_id = v_order.id
      and type = 'purchase_confirmed'
  )
  into v_has_purchase_credit;

  if v_status <> 'approved' then
    update public.payment_orders
    set
      status = case
        when status = 'paid' then status
        when v_status in ('pending', 'in_process', 'authorized') then 'pending'
        when v_status in ('cancelled', 'canceled') then 'canceled'
        when v_status = 'expired' then 'expired'
        else 'failed'
      end,
      provider_payment_id = coalesce(v_payment_id, provider_payment_id),
      provider_status = v_status,
      provider_payment_method = coalesce(v_payment_method, provider_payment_method),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_status', v_status
      ),
      updated_at = now()
    where id = v_order.id;

    return jsonb_build_object(
      'success', true,
      'paid', false,
      'order_id', v_order.id,
      'provider_status', v_status
    );
  end if;

  if v_has_purchase_credit then
    update public.payment_orders
    set
      status = 'paid',
      provider_payment_id = coalesce(v_payment_id, provider_payment_id),
      provider_status = v_status,
      provider_payment_method = coalesce(v_payment_method, provider_payment_method),
      paid_at = coalesce(paid_at, now()),
      processed_at = coalesce(processed_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_status', v_status,
        'paid_at', now()
      ),
      updated_at = now()
    where id = v_order.id;

    return jsonb_build_object(
      'success', true,
      'already_processed', true,
      'order_id', v_order.id
    );
  end if;

  if v_order.product_type <> 'itacash' then
    update public.payment_orders
    set
      status = 'paid',
      provider_payment_id = coalesce(v_payment_id, provider_payment_id),
      provider_status = v_status,
      provider_payment_method = coalesce(v_payment_method, provider_payment_method),
      paid_at = coalesce(paid_at, now()),
      processed_at = coalesce(processed_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_status', v_status,
        'paid_at', now()
      ),
      updated_at = now()
    where id = v_order.id;

    return jsonb_build_object(
      'success', true,
      'paid', true,
      'credited', false,
      'reason', 'unsupported_product_type',
      'order_id', v_order.id,
      'product_type', v_order.product_type
    );
  end if;

  if coalesce(v_order.amount_itacash, 0) <= 0 then
    raise exception 'Payment order has invalid ItaCash amount';
  end if;

  update public.payment_orders
  set
    status = 'paid',
    provider_payment_id = coalesce(v_payment_id, provider_payment_id),
    provider_status = v_status,
    provider_payment_method = coalesce(v_payment_method, provider_payment_method),
    paid_at = coalesce(paid_at, now()),
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'provider_status', v_status,
      'paid_at', now()
    ),
    updated_at = now()
  where id = v_order.id;

  insert into public.itacash_wallets (user_id)
  values (v_order.user_id)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from public.itacash_wallets
  where user_id = v_order.user_id
  for update;

  v_balance_after := v_wallet.balance + v_order.amount_itacash;

  update public.itacash_wallets
  set
    balance = v_balance_after,
    updated_at = now()
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
    v_order.amount_itacash,
    v_balance_after,
    'Compra de ItaCash confirmada via Mercado Pago',
    'payment_order',
    v_order.id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'provider', 'mercadopago',
      'origin', 'mercadopago_webhook',
      'provider_payment_id', coalesce(v_payment_id, v_order.provider_payment_id),
      'payment_method', coalesce(v_payment_method, v_order.provider_payment_method),
      'external_reference', v_order.external_reference
    )
  );

  update public.payment_orders
  set
    processed_at = coalesce(processed_at, now()),
    updated_at = now()
  where id = v_order.id;

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    amount
  )
  values (
    v_order.user_id,
    v_order.user_id,
    'itacash_purchase_approved',
    v_order.amount_itacash
  );

  return jsonb_build_object(
    'success', true,
    'paid', true,
    'credited', true,
    'order_id', v_order.id,
    'amount_itacash', v_order.amount_itacash,
    'balance_after', v_balance_after
  );
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
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.complete_mercadopago_payment_order_v2(text, text, text, jsonb) to service_role;
grant execute on function public.complete_mercadopago_payment_order(text, text, text) to service_role;

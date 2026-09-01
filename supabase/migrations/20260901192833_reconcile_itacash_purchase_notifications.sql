-- Mirror of the AF-01 change already applied remotely to EntreUs-dev.

alter table public.notifications
  add column if not exists itacash_purchase_request_id uuid
    references public.itacash_purchase_requests(id) on delete set null;

create index if not exists notifications_itacash_purchase_request_id_idx
  on public.notifications(itacash_purchase_request_id);

create unique index if not exists notifications_itacash_purchase_request_type_once_idx
  on public.notifications(user_id, type, itacash_purchase_request_id)
  where itacash_purchase_request_id is not null
    and type in ('itacash_purchase_approved', 'itacash_purchase_rejected');

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

  select * into v_request
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

  select * into v_wallet
  from public.itacash_wallets
  where user_id = v_request.user_id
  for update;

  v_balance_after := v_wallet.balance + v_request.amount_itacash;

  update public.itacash_wallets
  set balance = v_balance_after
  where id = v_wallet.id;

  insert into public.itacash_transactions (
    wallet_id, user_id, type, amount, balance_after, description,
    reference_type, reference_id, metadata
  ) values (
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
  set status = 'approved',
      reviewed_by = v_admin_id,
      reviewed_at = v_reviewed_at,
      admin_notes = nullif(trim(p_admin_notes), ''),
      rejection_reason = null
  where id = v_request.id;

  insert into public.notifications (
    user_id, actor_id, type, amount, itacash_purchase_request_id
  ) values (
    v_request.user_id,
    coalesce(v_admin_id, v_request.user_id),
    'itacash_purchase_approved',
    v_request.amount_itacash,
    v_request.id
  )
  on conflict do nothing;

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

  select * into v_request
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
  set status = 'rejected',
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      admin_notes = nullif(trim(p_admin_notes), ''),
      rejection_reason = v_reason
  where id = v_request.id;

  insert into public.notifications (
    user_id, actor_id, type, amount, itacash_purchase_request_id
  ) values (
    v_request.user_id,
    coalesce(v_admin_id, v_request.user_id),
    'itacash_purchase_rejected',
    v_request.amount_itacash,
    v_request.id
  )
  on conflict do nothing;

  return jsonb_build_object('success', true, 'request_id', v_request.id);
end;
$$;

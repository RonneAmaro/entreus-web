-- Add gift notifications and update send_digital_gift to notify receivers.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.notifications
  add column if not exists user_gift_id uuid references public.user_gifts(id) on delete set null;

create index if not exists notifications_user_gift_id_idx
  on public.notifications(user_gift_id);

create or replace function public.send_digital_gift(
  p_receiver_id uuid,
  p_gift_id uuid,
  p_message text default null,
  p_visibility text default 'public'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_sender_wallet public.itacash_wallets;
  v_receiver_wallet public.itacash_wallets;
  v_gift public.digital_gifts;
  v_user_gift_id uuid;
  v_sender_balance_after integer;
  v_receiver_balance_after integer;
begin
  if v_sender_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_receiver_id is null or p_receiver_id = v_sender_id then
    raise exception 'Invalid gift receiver';
  end if;

  if p_visibility not in ('public', 'private') then
    raise exception 'Invalid gift visibility';
  end if;

  insert into public.itacash_wallets (user_id)
  values (v_sender_id)
  on conflict (user_id) do nothing;

  insert into public.itacash_wallets (user_id)
  values (p_receiver_id)
  on conflict (user_id) do nothing;

  select *
  into v_gift
  from public.digital_gifts
  where id = p_gift_id
    and is_active = true;

  if v_gift.id is null then
    raise exception 'Gift not found';
  end if;

  select *
  into v_sender_wallet
  from public.itacash_wallets
  where user_id = v_sender_id
  for update;

  select *
  into v_receiver_wallet
  from public.itacash_wallets
  where user_id = p_receiver_id
  for update;

  if v_sender_wallet.balance < v_gift.price_itacash then
    raise exception 'Insufficient ItaCash balance';
  end if;

  v_sender_balance_after := v_sender_wallet.balance - v_gift.price_itacash;
  v_receiver_balance_after := v_receiver_wallet.balance + v_gift.price_itacash;

  update public.itacash_wallets
  set balance = v_sender_balance_after
  where id = v_sender_wallet.id;

  update public.itacash_wallets
  set balance = v_receiver_balance_after
  where id = v_receiver_wallet.id;

  insert into public.user_gifts (
    gift_id,
    sender_id,
    receiver_id,
    message,
    visibility,
    price_paid_itacash
  )
  values (
    p_gift_id,
    v_sender_id,
    p_receiver_id,
    nullif(trim(p_message), ''),
    p_visibility,
    v_gift.price_itacash
  )
  returning id into v_user_gift_id;

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
    v_sender_wallet.id,
    v_sender_id,
    'gift_sent',
    -v_gift.price_itacash,
    v_sender_balance_after,
    'Presente enviado: ' || v_gift.name,
    'user_gift',
    v_user_gift_id,
    jsonb_build_object('gift_id', p_gift_id, 'receiver_id', p_receiver_id)
  );

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
    v_receiver_wallet.id,
    p_receiver_id,
    'gift_received',
    v_gift.price_itacash,
    v_receiver_balance_after,
    'Presente recebido: ' || v_gift.name,
    'user_gift',
    v_user_gift_id,
    jsonb_build_object('gift_id', p_gift_id, 'sender_id', v_sender_id)
  );

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    user_gift_id
  )
  values (
    p_receiver_id,
    v_sender_id,
    'gift_received',
    v_user_gift_id
  );

  return jsonb_build_object(
    'success', true,
    'user_gift_id', v_user_gift_id,
    'sender_balance_after', v_sender_balance_after,
    'receiver_balance_after', v_receiver_balance_after
  );
end;
$$;

grant execute on function public.send_digital_gift(uuid, uuid, text, text) to authenticated;

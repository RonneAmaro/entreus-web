-- Separate visual gifts from ItaCash tips/support.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.itacash_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_itacash integer not null,
  amount_brl numeric(10,2) not null,
  status text not null default 'pending',
  payment_method text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint itacash_purchase_requests_amount_check check (amount_itacash > 0 and amount_brl > 0),
  constraint itacash_purchase_requests_status_check check (status in ('pending', 'paid', 'canceled', 'failed'))
);

create index if not exists itacash_purchase_requests_user_created_at_idx
  on public.itacash_purchase_requests(user_id, created_at desc);

alter table public.itacash_purchase_requests enable row level security;

drop policy if exists "Users can create own ItaCash purchase requests"
  on public.itacash_purchase_requests;

create policy "Users can create own ItaCash purchase requests"
  on public.itacash_purchase_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "Users can read own ItaCash purchase requests"
  on public.itacash_purchase_requests;

create policy "Users can read own ItaCash purchase requests"
  on public.itacash_purchase_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

alter table public.notifications
  add column if not exists amount integer null;

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
      'refund',
      'adjustment'
    ));
end $$;

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
  v_gift public.digital_gifts;
  v_user_gift_id uuid;
  v_sender_balance_after integer;
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

  if v_sender_wallet.balance < v_gift.price_itacash then
    raise exception 'Insufficient ItaCash balance';
  end if;

  v_sender_balance_after := v_sender_wallet.balance - v_gift.price_itacash;

  update public.itacash_wallets
  set balance = v_sender_balance_after
  where id = v_sender_wallet.id;

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
    'Presente visual enviado: ' || v_gift.name,
    'user_gift',
    v_user_gift_id,
    jsonb_build_object('gift_id', p_gift_id, 'receiver_id', p_receiver_id)
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
    'sender_balance_after', v_sender_balance_after
  );
end;
$$;

create or replace function public.send_itacash_tip(
  p_receiver_id uuid,
  p_amount integer,
  p_message text default null
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
  v_sender_balance_after integer;
  v_receiver_balance_after integer;
begin
  if v_sender_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_receiver_id is null or p_receiver_id = v_sender_id then
    raise exception 'Invalid tip receiver';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid tip amount';
  end if;

  insert into public.itacash_wallets (user_id)
  values (v_sender_id)
  on conflict (user_id) do nothing;

  insert into public.itacash_wallets (user_id)
  values (p_receiver_id)
  on conflict (user_id) do nothing;

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

  if v_sender_wallet.balance < p_amount then
    raise exception 'Insufficient ItaCash balance';
  end if;

  v_sender_balance_after := v_sender_wallet.balance - p_amount;
  v_receiver_balance_after := v_receiver_wallet.balance + p_amount;

  update public.itacash_wallets
  set balance = v_sender_balance_after
  where id = v_sender_wallet.id;

  update public.itacash_wallets
  set balance = v_receiver_balance_after
  where id = v_receiver_wallet.id;

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
    'tip_sent',
    -p_amount,
    v_sender_balance_after,
    'Apoio enviado em ItaCash',
    'itacash_tip',
    null,
    jsonb_build_object('receiver_id', p_receiver_id, 'message', nullif(trim(p_message), ''))
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
    'tip_received',
    p_amount,
    v_receiver_balance_after,
    'Apoio recebido em ItaCash',
    'itacash_tip',
    null,
    jsonb_build_object('sender_id', v_sender_id, 'message', nullif(trim(p_message), ''))
  );

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    amount
  )
  values (
    p_receiver_id,
    v_sender_id,
    'tip_received',
    p_amount
  );

  return jsonb_build_object(
    'success', true,
    'amount', p_amount,
    'sender_balance_after', v_sender_balance_after,
    'receiver_balance_after', v_receiver_balance_after
  );
end;
$$;

grant execute on function public.send_digital_gift(uuid, uuid, text, text) to authenticated;
grant execute on function public.send_itacash_tip(uuid, integer, text) to authenticated;

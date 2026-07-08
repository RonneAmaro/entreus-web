-- Package 40: automatic 85/15 revenue split for ItaCash monetization.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.platform_revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid null,
  payer_id uuid null references auth.users(id) on delete set null,
  creator_id uuid null references auth.users(id) on delete set null,
  gross_amount integer not null,
  creator_amount integer not null,
  platform_fee_amount integer not null,
  platform_fee_bps integer not null default 1500,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_revenue_ledger_amounts_non_negative_check
    check (gross_amount >= 0 and creator_amount >= 0 and platform_fee_amount >= 0),
  constraint platform_revenue_ledger_split_total_check
    check (gross_amount = creator_amount + platform_fee_amount),
  constraint platform_revenue_ledger_platform_fee_bps_check
    check (platform_fee_bps between 0 and 10000)
);

create index if not exists platform_revenue_ledger_created_at_idx
  on public.platform_revenue_ledger(created_at desc);

create index if not exists platform_revenue_ledger_creator_created_at_idx
  on public.platform_revenue_ledger(creator_id, created_at desc);

create index if not exists platform_revenue_ledger_source_idx
  on public.platform_revenue_ledger(source_type, source_id);

alter table public.platform_revenue_ledger enable row level security;

drop policy if exists "Admins can read platform revenue ledger"
  on public.platform_revenue_ledger;

create policy "Admins can read platform revenue ledger"
  on public.platform_revenue_ledger
  for select
  to authenticated
  using (public.is_admin());

revoke all on table public.platform_revenue_ledger from public;
revoke all on table public.platform_revenue_ledger from anon, authenticated;
grant select on table public.platform_revenue_ledger to authenticated;

alter table public.paid_post_unlocks
  add column if not exists creator_amount integer,
  add column if not exists platform_fee_amount integer,
  add column if not exists platform_fee_bps integer;

update public.paid_post_unlocks
set
  creator_amount = coalesce(creator_amount, amount),
  platform_fee_amount = coalesce(platform_fee_amount, 0),
  platform_fee_bps = coalesce(platform_fee_bps, 0)
where creator_amount is null
  or platform_fee_amount is null
  or platform_fee_bps is null;

alter table public.paid_post_unlocks
  alter column creator_amount set not null,
  alter column platform_fee_amount set not null,
  alter column platform_fee_bps set default 1500,
  alter column platform_fee_bps set not null;

do $$
begin
  alter table public.paid_post_unlocks
    drop constraint if exists paid_post_unlocks_creator_amount_check;

  alter table public.paid_post_unlocks
    add constraint paid_post_unlocks_creator_amount_check
    check (creator_amount >= 0);

  alter table public.paid_post_unlocks
    drop constraint if exists paid_post_unlocks_platform_fee_amount_check;

  alter table public.paid_post_unlocks
    add constraint paid_post_unlocks_platform_fee_amount_check
    check (platform_fee_amount >= 0);

  alter table public.paid_post_unlocks
    drop constraint if exists paid_post_unlocks_platform_fee_bps_check;

  alter table public.paid_post_unlocks
    add constraint paid_post_unlocks_platform_fee_bps_check
    check (platform_fee_bps between 0 and 10000);

  alter table public.paid_post_unlocks
    drop constraint if exists paid_post_unlocks_revenue_split_total_check;

  alter table public.paid_post_unlocks
    add constraint paid_post_unlocks_revenue_split_total_check
    check (amount = creator_amount + platform_fee_amount);
end $$;

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
  v_platform_fee_bps integer := 1500;
  v_creator_share_bps integer := 8500;
  v_platform_fee_amount integer;
  v_creator_amount integer;
  v_ledger_id uuid;
  v_split_metadata jsonb;
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

  v_platform_fee_amount := ((p_amount::bigint * v_platform_fee_bps) / 10000)::integer;
  v_creator_amount := p_amount - v_platform_fee_amount;

  if v_creator_amount < 0
    or v_platform_fee_amount < 0
    or v_creator_amount + v_platform_fee_amount <> p_amount then
    raise exception 'Invalid revenue split';
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
  v_receiver_balance_after := v_receiver_wallet.balance + v_creator_amount;

  update public.itacash_wallets
  set balance = v_sender_balance_after
  where id = v_sender_wallet.id;

  update public.itacash_wallets
  set balance = v_receiver_balance_after
  where id = v_receiver_wallet.id;

  v_split_metadata := jsonb_build_object(
    'gross_amount', p_amount,
    'creator_amount', v_creator_amount,
    'platform_fee_amount', v_platform_fee_amount,
    'platform_fee_bps', v_platform_fee_bps,
    'creator_share_bps', v_creator_share_bps
  );

  insert into public.platform_revenue_ledger (
    source_type,
    source_id,
    payer_id,
    creator_id,
    gross_amount,
    creator_amount,
    platform_fee_amount,
    platform_fee_bps,
    metadata
  )
  values (
    'itacash_tip',
    null,
    v_sender_id,
    p_receiver_id,
    p_amount,
    v_creator_amount,
    v_platform_fee_amount,
    v_platform_fee_bps,
    v_split_metadata || jsonb_build_object('message', nullif(trim(p_message), ''))
  )
  returning id into v_ledger_id;

  v_split_metadata := v_split_metadata || jsonb_build_object('platform_revenue_ledger_id', v_ledger_id);

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
    'Gorjeta enviada em ItaCash',
    'itacash_tip',
    null,
    v_split_metadata || jsonb_build_object('receiver_id', p_receiver_id, 'message', nullif(trim(p_message), ''))
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
    v_creator_amount,
    v_receiver_balance_after,
    'Gorjeta recebida liquida em ItaCash',
    'itacash_tip',
    null,
    v_split_metadata || jsonb_build_object('sender_id', v_sender_id, 'message', nullif(trim(p_message), ''))
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
    v_creator_amount
  );

  return jsonb_build_object(
    'success', true,
    'amount', p_amount,
    'gross_amount', p_amount,
    'creator_amount', v_creator_amount,
    'platform_fee_amount', v_platform_fee_amount,
    'platform_fee_bps', v_platform_fee_bps,
    'sender_balance_after', v_sender_balance_after,
    'receiver_balance_after', v_receiver_balance_after
  );
end;
$$;

create or replace function public.unlock_paid_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_post public.posts;
  v_buyer_wallet public.itacash_wallets;
  v_creator_wallet public.itacash_wallets;
  v_unlock_id uuid;
  v_existing_unlock record;
  v_buyer_balance_after integer;
  v_creator_balance_after integer;
  v_platform_fee_bps integer := 1500;
  v_creator_share_bps integer := 8500;
  v_platform_fee_amount integer;
  v_creator_amount integer;
  v_ledger_id uuid;
  v_split_metadata jsonb;
begin
  if v_buyer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_post_id is null then
    raise exception 'Post not found';
  end if;

  select *
  into v_post
  from public.posts
  where id = p_post_id;

  if v_post.id is null then
    raise exception 'Post not found';
  end if;

  if coalesce(v_post.moderation_status, 'active') <> 'active' then
    raise exception 'Post not found';
  end if;

  if coalesce(v_post.is_paid, false) = false or coalesce(v_post.price_itacash, 0) <= 0 then
    raise exception 'Post is not paid';
  end if;

  if v_post.user_id = v_buyer_id then
    raise exception 'Cannot unlock own post';
  end if;

  if (
    v_post.community_type = 'adult_18plus'
    or v_post.content_rating = 'adult_18plus'
    or lower(btrim(coalesce(v_post.category, ''))) in ('adulto', 'sensual', '18plus')
  ) and not public.can_view_adult_content_for_rls(v_buyer_id) then
    raise exception 'Adult content requires 18+ verification';
  end if;

  if v_post.visibility = 'private' then
    raise exception 'Post not found';
  end if;

  if v_post.visibility = 'followers' and not exists (
    select 1
    from public.follows
    where follower_id = v_buyer_id
      and following_id = v_post.user_id
  ) then
    raise exception 'Post not found';
  end if;

  select id, amount, creator_amount, platform_fee_amount, platform_fee_bps
  into v_existing_unlock
  from public.paid_post_unlocks
  where post_id = p_post_id
    and buyer_id = v_buyer_id;

  if found then
    return jsonb_build_object(
      'success', true,
      'already_unlocked', true,
      'unlock_id', v_existing_unlock.id,
      'amount', v_existing_unlock.amount,
      'gross_amount', v_existing_unlock.amount,
      'creator_amount', v_existing_unlock.creator_amount,
      'platform_fee_amount', v_existing_unlock.platform_fee_amount,
      'platform_fee_bps', v_existing_unlock.platform_fee_bps
    );
  end if;

  insert into public.itacash_wallets (user_id)
  values (v_buyer_id)
  on conflict (user_id) do nothing;

  insert into public.itacash_wallets (user_id)
  values (v_post.user_id)
  on conflict (user_id) do nothing;

  select *
  into v_buyer_wallet
  from public.itacash_wallets
  where user_id = v_buyer_id
  for update;

  select *
  into v_creator_wallet
  from public.itacash_wallets
  where user_id = v_post.user_id
  for update;

  select id, amount, creator_amount, platform_fee_amount, platform_fee_bps
  into v_existing_unlock
  from public.paid_post_unlocks
  where post_id = p_post_id
    and buyer_id = v_buyer_id;

  if found then
    return jsonb_build_object(
      'success', true,
      'already_unlocked', true,
      'unlock_id', v_existing_unlock.id,
      'amount', v_existing_unlock.amount,
      'gross_amount', v_existing_unlock.amount,
      'creator_amount', v_existing_unlock.creator_amount,
      'platform_fee_amount', v_existing_unlock.platform_fee_amount,
      'platform_fee_bps', v_existing_unlock.platform_fee_bps
    );
  end if;

  if v_buyer_wallet.balance < v_post.price_itacash then
    raise exception 'Insufficient ItaCash balance';
  end if;

  v_platform_fee_amount := ((v_post.price_itacash::bigint * v_platform_fee_bps) / 10000)::integer;
  v_creator_amount := v_post.price_itacash - v_platform_fee_amount;

  if v_creator_amount < 0
    or v_platform_fee_amount < 0
    or v_creator_amount + v_platform_fee_amount <> v_post.price_itacash then
    raise exception 'Invalid revenue split';
  end if;

  insert into public.paid_post_unlocks (
    post_id,
    buyer_id,
    creator_id,
    amount,
    creator_amount,
    platform_fee_amount,
    platform_fee_bps
  )
  values (
    p_post_id,
    v_buyer_id,
    v_post.user_id,
    v_post.price_itacash,
    v_creator_amount,
    v_platform_fee_amount,
    v_platform_fee_bps
  )
  on conflict (post_id, buyer_id) do nothing
  returning id into v_unlock_id;

  if v_unlock_id is null then
    select id, amount, creator_amount, platform_fee_amount, platform_fee_bps
    into v_existing_unlock
    from public.paid_post_unlocks
    where post_id = p_post_id
      and buyer_id = v_buyer_id;

    return jsonb_build_object(
      'success', true,
      'already_unlocked', true,
      'unlock_id', v_existing_unlock.id,
      'amount', v_existing_unlock.amount,
      'gross_amount', v_existing_unlock.amount,
      'creator_amount', v_existing_unlock.creator_amount,
      'platform_fee_amount', v_existing_unlock.platform_fee_amount,
      'platform_fee_bps', v_existing_unlock.platform_fee_bps
    );
  end if;

  v_buyer_balance_after := v_buyer_wallet.balance - v_post.price_itacash;
  v_creator_balance_after := v_creator_wallet.balance + v_creator_amount;

  update public.itacash_wallets
  set balance = v_buyer_balance_after
  where id = v_buyer_wallet.id;

  update public.itacash_wallets
  set balance = v_creator_balance_after
  where id = v_creator_wallet.id;

  v_split_metadata := jsonb_build_object(
    'gross_amount', v_post.price_itacash,
    'creator_amount', v_creator_amount,
    'platform_fee_amount', v_platform_fee_amount,
    'platform_fee_bps', v_platform_fee_bps,
    'creator_share_bps', v_creator_share_bps,
    'post_id', p_post_id,
    'unlock_id', v_unlock_id
  );

  insert into public.platform_revenue_ledger (
    source_type,
    source_id,
    payer_id,
    creator_id,
    gross_amount,
    creator_amount,
    platform_fee_amount,
    platform_fee_bps,
    metadata
  )
  values (
    'paid_post_unlock',
    v_unlock_id,
    v_buyer_id,
    v_post.user_id,
    v_post.price_itacash,
    v_creator_amount,
    v_platform_fee_amount,
    v_platform_fee_bps,
    v_split_metadata
  )
  returning id into v_ledger_id;

  v_split_metadata := v_split_metadata || jsonb_build_object('platform_revenue_ledger_id', v_ledger_id);

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
    v_buyer_wallet.id,
    v_buyer_id,
    'paid_post_unlock',
    -v_post.price_itacash,
    v_buyer_balance_after,
    'Desbloqueio de post pago',
    'paid_post_unlock',
    v_unlock_id,
    v_split_metadata || jsonb_build_object('creator_id', v_post.user_id)
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
    v_creator_wallet.id,
    v_post.user_id,
    'paid_post_received',
    v_creator_amount,
    v_creator_balance_after,
    'Post pago recebido liquido',
    'paid_post_unlock',
    v_unlock_id,
    v_split_metadata || jsonb_build_object('buyer_id', v_buyer_id)
  );

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    post_id,
    amount
  )
  values (
    v_post.user_id,
    v_buyer_id,
    'paid_post_unlocked',
    p_post_id,
    v_creator_amount
  );

  return jsonb_build_object(
    'success', true,
    'already_unlocked', false,
    'unlock_id', v_unlock_id,
    'amount', v_post.price_itacash,
    'gross_amount', v_post.price_itacash,
    'creator_amount', v_creator_amount,
    'platform_fee_amount', v_platform_fee_amount,
    'platform_fee_bps', v_platform_fee_bps,
    'buyer_balance_after', v_buyer_balance_after,
    'creator_balance_after', v_creator_balance_after
  );
end;
$$;

revoke all on function public.send_itacash_tip(uuid, integer, text) from public;
grant execute on function public.send_itacash_tip(uuid, integer, text) to authenticated;

revoke all on function public.unlock_paid_post(uuid) from public;
grant execute on function public.unlock_paid_post(uuid) to authenticated;

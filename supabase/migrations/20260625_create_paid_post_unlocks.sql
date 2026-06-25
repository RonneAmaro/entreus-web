-- Package 38: paid/unlockable posts with ItaCash.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

alter table public.posts
  add column if not exists is_paid boolean not null default false,
  add column if not exists price_itacash integer null;

do $$
begin
  alter table public.posts
    drop constraint if exists posts_paid_price_check;

  alter table public.posts
    add constraint posts_paid_price_check
    check (
      (is_paid = false and price_itacash is null)
      or (is_paid = true and price_itacash is not null and price_itacash > 0)
    );
end $$;

create index if not exists posts_paid_created_at_idx
  on public.posts(is_paid, created_at desc)
  where is_paid = true;

create table if not exists public.paid_post_unlocks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  created_at timestamptz not null default now(),
  constraint paid_post_unlocks_amount_check check (amount > 0),
  constraint paid_post_unlocks_not_self_check check (buyer_id <> creator_id),
  unique (post_id, buyer_id)
);

create index if not exists paid_post_unlocks_buyer_created_at_idx
  on public.paid_post_unlocks(buyer_id, created_at desc);

create index if not exists paid_post_unlocks_creator_created_at_idx
  on public.paid_post_unlocks(creator_id, created_at desc);

create index if not exists paid_post_unlocks_post_created_at_idx
  on public.paid_post_unlocks(post_id, created_at desc);

alter table public.paid_post_unlocks enable row level security;

drop policy if exists "Users can read own paid post unlocks"
  on public.paid_post_unlocks;

create policy "Users can read own paid post unlocks"
  on public.paid_post_unlocks
  for select
  to authenticated
  using (auth.uid() = buyer_id or auth.uid() = creator_id or public.is_admin());

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
      'support_sent',
      'support_received',
      'paid_post_unlock',
      'paid_post_received',
      'purchase_confirmed',
      'promotional_credit',
      'refund',
      'adjustment'
    ));
end $$;

do $$
begin
  alter table public.notifications
    drop constraint if exists notifications_type_check;

  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'like',
      'comment',
      'repost',
      'follow',
      'gift_received',
      'tip_received',
      'paid_post_unlocked',
      'promotional_itacash',
      'promotional_itacash_credit',
      'itacash_promotional_credit',
      'itacash_purchase_approved',
      'itacash_purchase_rejected',
      'post_hidden',
      'moderation_warning',
      'badge_awarded'
    ));
end $$;

create or replace function public.can_view_paid_post_for_rls(p_post_id uuid, p_owner_id uuid, p_is_paid boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(p_is_paid, false) = false then true
    when public.is_admin() then true
    when p_owner_id = auth.uid() then true
    when exists (
      select 1
      from public.paid_post_unlocks u
      where u.post_id = p_post_id
        and u.buyer_id = auth.uid()
    ) then true
    else false
  end;
$$;

drop policy if exists "Adult-safe post media select" on public.post_media;

create policy "Adult-safe post media select"
  on public.post_media
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and public.can_view_post_for_rls(p.user_id, p.community_type, p.content_rating, p.moderation_status)
        and public.can_view_paid_post_for_rls(p.id, p.user_id, p.is_paid)
    )
  );

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
  v_buyer_balance_after integer;
  v_creator_balance_after integer;
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

  if exists (
    select 1
    from public.paid_post_unlocks
    where post_id = p_post_id
      and buyer_id = v_buyer_id
  ) then
    return jsonb_build_object('success', true, 'already_unlocked', true, 'amount', v_post.price_itacash);
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

  if exists (
    select 1
    from public.paid_post_unlocks
    where post_id = p_post_id
      and buyer_id = v_buyer_id
  ) then
    return jsonb_build_object('success', true, 'already_unlocked', true, 'amount', v_post.price_itacash);
  end if;

  if v_buyer_wallet.balance < v_post.price_itacash then
    raise exception 'Insufficient ItaCash balance';
  end if;

  insert into public.paid_post_unlocks (
    post_id,
    buyer_id,
    creator_id,
    amount
  )
  values (
    p_post_id,
    v_buyer_id,
    v_post.user_id,
    v_post.price_itacash
  )
  on conflict (post_id, buyer_id) do nothing
  returning id into v_unlock_id;

  if v_unlock_id is null then
    return jsonb_build_object('success', true, 'already_unlocked', true, 'amount', v_post.price_itacash);
  end if;

  v_buyer_balance_after := v_buyer_wallet.balance - v_post.price_itacash;
  v_creator_balance_after := v_creator_wallet.balance + v_post.price_itacash;

  update public.itacash_wallets
  set balance = v_buyer_balance_after
  where id = v_buyer_wallet.id;

  update public.itacash_wallets
  set balance = v_creator_balance_after
  where id = v_creator_wallet.id;

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
    jsonb_build_object('post_id', p_post_id, 'creator_id', v_post.user_id)
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
    v_post.price_itacash,
    v_creator_balance_after,
    'Recebimento por post pago',
    'paid_post_unlock',
    v_unlock_id,
    jsonb_build_object('post_id', p_post_id, 'buyer_id', v_buyer_id)
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
    v_post.price_itacash
  );

  return jsonb_build_object(
    'success', true,
    'already_unlocked', false,
    'unlock_id', v_unlock_id,
    'amount', v_post.price_itacash,
    'buyer_balance_after', v_buyer_balance_after,
    'creator_balance_after', v_creator_balance_after
  );
end;
$$;

revoke all on function public.unlock_paid_post(uuid) from public;
grant execute on function public.unlock_paid_post(uuid) to authenticated;

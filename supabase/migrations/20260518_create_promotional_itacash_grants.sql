-- Prepared migration for promotional ItaCash grants.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.itacash_promotional_grants (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_itacash integer not null,
  reason text not null,
  campaign text null,
  status text not null default 'granted',
  transaction_id uuid null references public.itacash_transactions(id) on delete set null,
  created_at timestamptz default now(),
  constraint itacash_promotional_grants_amount_check check (amount_itacash > 0),
  constraint itacash_promotional_grants_reason_check check (char_length(trim(reason)) > 0),
  constraint itacash_promotional_grants_status_check check (status in ('granted', 'canceled'))
);

create index if not exists itacash_promotional_grants_user_created_at_idx
  on public.itacash_promotional_grants(user_id, created_at desc);

create index if not exists itacash_promotional_grants_admin_created_at_idx
  on public.itacash_promotional_grants(admin_id, created_at desc);

alter table public.itacash_promotional_grants enable row level security;

drop policy if exists "Users can read own promotional ItaCash grants"
  on public.itacash_promotional_grants;

create policy "Users can read own promotional ItaCash grants"
  on public.itacash_promotional_grants
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can read promotional ItaCash grants"
  on public.itacash_promotional_grants;

create policy "Admins can read promotional ItaCash grants"
  on public.itacash_promotional_grants
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can create promotional ItaCash grants"
  on public.itacash_promotional_grants;

create policy "Admins can create promotional ItaCash grants"
  on public.itacash_promotional_grants
  for insert
  to authenticated
  with check (public.is_admin() and auth.uid() = admin_id);

create or replace function public.grant_promotional_itacash(
  p_user_id uuid,
  p_amount_itacash integer,
  p_reason text,
  p_campaign text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_wallet public.itacash_wallets;
  v_balance_after integer;
  v_reason text := nullif(trim(p_reason), '');
  v_campaign text := nullif(trim(p_campaign), '');
  v_transaction_id uuid;
  v_grant_id uuid;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  if p_user_id is null then
    raise exception 'User is required';
  end if;

  if p_amount_itacash is null or p_amount_itacash <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if v_reason is null then
    raise exception 'Reason is required';
  end if;

  insert into public.itacash_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from public.itacash_wallets
  where user_id = p_user_id
  for update;

  v_balance_after := v_wallet.balance + p_amount_itacash;

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
    p_user_id,
    'admin_credit',
    p_amount_itacash,
    v_balance_after,
    'Credito promocional EntreUS',
    'itacash_promotional_grant',
    null,
    jsonb_build_object(
      'promotional', true,
      'withdrawable', false,
      'reason', v_reason,
      'campaign', v_campaign,
      'granted_by', v_admin_id
    )
  )
  returning id into v_transaction_id;

  insert into public.itacash_promotional_grants (
    admin_id,
    user_id,
    amount_itacash,
    reason,
    campaign,
    status,
    transaction_id
  )
  values (
    v_admin_id,
    p_user_id,
    p_amount_itacash,
    v_reason,
    v_campaign,
    'granted',
    v_transaction_id
  )
  returning id into v_grant_id;

  update public.itacash_transactions
  set
    reference_id = v_grant_id,
    metadata = metadata || jsonb_build_object('grant_id', v_grant_id)
  where id = v_transaction_id;

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    amount
  )
  values (
    p_user_id,
    v_admin_id,
    'promotional_itacash',
    p_amount_itacash
  );

  return jsonb_build_object(
    'success', true,
    'grant_id', v_grant_id,
    'transaction_id', v_transaction_id,
    'wallet_id', v_wallet.id,
    'balance_after', v_balance_after
  );
end;
$$;

grant execute on function public.grant_promotional_itacash(uuid, integer, text, text) to authenticated;

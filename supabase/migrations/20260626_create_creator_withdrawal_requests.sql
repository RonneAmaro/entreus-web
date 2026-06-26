-- Package 40: manual creator withdrawal requests.
-- Review and apply manually in Supabase. Do not run automatically from Codex.
-- This package does not perform Pix payout and does not integrate payment automation.

create table if not exists public.creator_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.itacash_wallets(id) on delete restrict,
  amount_itacash integer not null,
  amount_brl numeric(10,2) not null,
  itacash_per_brl integer not null default 10,
  pix_key text not null,
  pix_key_type text not null,
  holder_name text not null,
  status text not null default 'pending',
  admin_notes text null,
  rejection_reason text null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.creator_withdrawal_requests
    drop constraint if exists creator_withdrawal_requests_amount_check;

  alter table public.creator_withdrawal_requests
    add constraint creator_withdrawal_requests_amount_check
    check (
      amount_itacash >= 1000
      and itacash_per_brl = 10
      and amount_brl = (amount_itacash::numeric / itacash_per_brl::numeric)
    );

  alter table public.creator_withdrawal_requests
    drop constraint if exists creator_withdrawal_requests_status_check;

  alter table public.creator_withdrawal_requests
    add constraint creator_withdrawal_requests_status_check
    check (status in ('pending', 'paid', 'rejected', 'cancelled'));

  alter table public.creator_withdrawal_requests
    drop constraint if exists creator_withdrawal_requests_pix_key_type_check;

  alter table public.creator_withdrawal_requests
    add constraint creator_withdrawal_requests_pix_key_type_check
    check (pix_key_type in ('cpf', 'email', 'phone', 'random', 'cnpj'));

  alter table public.creator_withdrawal_requests
    drop constraint if exists creator_withdrawal_requests_pix_fields_check;

  alter table public.creator_withdrawal_requests
    add constraint creator_withdrawal_requests_pix_fields_check
    check (
      char_length(btrim(pix_key)) between 3 and 254
      and char_length(btrim(holder_name)) between 2 and 160
    );
end $$;

create index if not exists creator_withdrawal_requests_user_created_at_idx
  on public.creator_withdrawal_requests(user_id, created_at desc);

create index if not exists creator_withdrawal_requests_status_created_at_idx
  on public.creator_withdrawal_requests(status, created_at desc);

create index if not exists creator_withdrawal_requests_wallet_created_at_idx
  on public.creator_withdrawal_requests(wallet_id, created_at desc);

drop trigger if exists set_creator_withdrawal_requests_updated_at
  on public.creator_withdrawal_requests;

create trigger set_creator_withdrawal_requests_updated_at
  before update on public.creator_withdrawal_requests
  for each row
  execute function public.set_itacash_updated_at();

alter table public.creator_withdrawal_requests enable row level security;

drop policy if exists "Users can read own creator withdrawal requests"
  on public.creator_withdrawal_requests;

create policy "Users can read own creator withdrawal requests"
  on public.creator_withdrawal_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can read creator withdrawal requests"
  on public.creator_withdrawal_requests;

create policy "Admins can read creator withdrawal requests"
  on public.creator_withdrawal_requests
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update creator withdrawal requests"
  on public.creator_withdrawal_requests;

-- No direct update policy: admins must process withdrawals through RPCs so
-- rejections refund the wallet and paid requests do not debit twice.

alter table public.notifications
  add column if not exists creator_withdrawal_request_id uuid references public.creator_withdrawal_requests(id) on delete set null;

create index if not exists notifications_creator_withdrawal_request_id_idx
  on public.notifications(creator_withdrawal_request_id);

create unique index if not exists notifications_creator_withdrawal_request_type_once_idx
  on public.notifications(user_id, type, creator_withdrawal_request_id)
  where creator_withdrawal_request_id is not null
    and type in ('withdrawal_requested', 'withdrawal_paid', 'withdrawal_rejected');

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
      'withdrawal_requested',
      'withdrawal_refunded',
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
      'withdrawal_requested',
      'withdrawal_paid',
      'withdrawal_rejected',
      'post_hidden',
      'moderation_warning',
      'badge_awarded'
    ));
end $$;

create or replace function public.request_creator_withdrawal(
  p_amount_itacash integer,
  p_pix_key text,
  p_pix_key_type text,
  p_holder_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.itacash_wallets;
  v_request_id uuid;
  v_amount_brl numeric(10,2);
  v_balance_after integer;
  v_pix_key text := nullif(btrim(p_pix_key), '');
  v_pix_key_type text := lower(nullif(btrim(p_pix_key_type), ''));
  v_holder_name text := nullif(btrim(p_holder_name), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount_itacash is null or p_amount_itacash <= 0 then
    raise exception 'Invalid withdrawal amount';
  end if;

  if p_amount_itacash < 1000 then
    raise exception 'Minimum withdrawal amount is 1000 ItaCash';
  end if;

  if v_pix_key_type is null or v_pix_key_type not in ('cpf', 'email', 'phone', 'random', 'cnpj') then
    raise exception 'Invalid Pix key type';
  end if;

  if v_pix_key is null or char_length(v_pix_key) < 3 or char_length(v_pix_key) > 254 then
    raise exception 'Invalid Pix key';
  end if;

  if v_holder_name is null or char_length(v_holder_name) < 2 or char_length(v_holder_name) > 160 then
    raise exception 'Invalid Pix holder name';
  end if;

  insert into public.itacash_wallets (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from public.itacash_wallets
  where user_id = v_user_id
  for update;

  if v_wallet.id is null then
    raise exception 'Wallet not found';
  end if;

  if v_wallet.balance < p_amount_itacash then
    raise exception 'Insufficient ItaCash balance';
  end if;

  v_balance_after := v_wallet.balance - p_amount_itacash;
  v_amount_brl := p_amount_itacash::numeric / 10;

  update public.itacash_wallets
  set balance = v_balance_after
  where id = v_wallet.id;

  insert into public.creator_withdrawal_requests (
    user_id,
    wallet_id,
    amount_itacash,
    amount_brl,
    itacash_per_brl,
    pix_key,
    pix_key_type,
    holder_name,
    status
  )
  values (
    v_user_id,
    v_wallet.id,
    p_amount_itacash,
    v_amount_brl,
    10,
    v_pix_key,
    v_pix_key_type,
    v_holder_name,
    'pending'
  )
  returning id into v_request_id;

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
    v_user_id,
    'withdrawal_requested',
    -p_amount_itacash,
    v_balance_after,
    'Saque manual solicitado',
    'creator_withdrawal_request',
    v_request_id,
    jsonb_build_object(
      'amount_brl', v_amount_brl,
      'itacash_per_brl', 10,
      'pix_key_type', v_pix_key_type
    )
  );

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    amount,
    creator_withdrawal_request_id
  )
  values (
    v_user_id,
    v_user_id,
    'withdrawal_requested',
    p_amount_itacash,
    v_request_id
  )
  on conflict do nothing;

  return jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'wallet_id', v_wallet.id,
    'amount_itacash', p_amount_itacash,
    'amount_brl', v_amount_brl,
    'balance_after', v_balance_after,
    'status', 'pending'
  );
end;
$$;

create or replace function public.reject_creator_withdrawal(
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_request public.creator_withdrawal_requests;
  v_wallet public.itacash_wallets;
  v_reason text := nullif(btrim(p_reason), '');
  v_balance_after integer;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  if v_reason is null then
    raise exception 'Rejection reason is required';
  end if;

  select *
  into v_request
  from public.creator_withdrawal_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Withdrawal request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending withdrawal requests can be rejected';
  end if;

  select *
  into v_wallet
  from public.itacash_wallets
  where id = v_request.wallet_id
  for update;

  if v_wallet.id is null then
    raise exception 'Wallet not found';
  end if;

  v_balance_after := v_wallet.balance + v_request.amount_itacash;

  update public.itacash_wallets
  set balance = v_balance_after
  where id = v_wallet.id;

  update public.creator_withdrawal_requests
  set
    status = 'rejected',
    rejection_reason = v_reason,
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    paid_at = null,
    admin_notes = null
  where id = v_request.id;

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
    'withdrawal_refunded',
    v_request.amount_itacash,
    v_balance_after,
    'Saque manual recusado e estornado',
    'creator_withdrawal_request',
    v_request.id,
    jsonb_build_object('reason', v_reason, 'reviewed_by', v_admin_id)
  );

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    amount,
    creator_withdrawal_request_id
  )
  values (
    v_request.user_id,
    v_admin_id,
    'withdrawal_rejected',
    v_request.amount_itacash,
    v_request.id
  )
  on conflict do nothing;

  return jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'status', 'rejected',
    'balance_after', v_balance_after
  );
end;
$$;

create or replace function public.mark_creator_withdrawal_paid(
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
  v_request public.creator_withdrawal_requests;
  v_reviewed_at timestamptz := now();
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  select *
  into v_request
  from public.creator_withdrawal_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Withdrawal request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending withdrawal requests can be marked as paid';
  end if;

  update public.creator_withdrawal_requests
  set
    status = 'paid',
    reviewed_by = v_admin_id,
    reviewed_at = v_reviewed_at,
    paid_at = v_reviewed_at,
    admin_notes = nullif(btrim(p_admin_notes), ''),
    rejection_reason = null
  where id = v_request.id;

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    amount,
    creator_withdrawal_request_id
  )
  values (
    v_request.user_id,
    v_admin_id,
    'withdrawal_paid',
    v_request.amount_itacash,
    v_request.id
  )
  on conflict do nothing;

  return jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'status', 'paid'
  );
end;
$$;

revoke all on function public.request_creator_withdrawal(integer, text, text, text) from public;
revoke all on function public.reject_creator_withdrawal(uuid, text) from public;
revoke all on function public.mark_creator_withdrawal_paid(uuid, text) from public;

grant execute on function public.request_creator_withdrawal(integer, text, text, text) to authenticated;
grant execute on function public.reject_creator_withdrawal(uuid, text) to authenticated;
grant execute on function public.mark_creator_withdrawal_paid(uuid, text) to authenticated;

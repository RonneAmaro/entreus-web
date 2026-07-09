-- Package 42: manual creator withdrawals with payment methods.
-- Review and apply manually in Supabase. Do not run automatically from Codex.
-- This package does not perform Pix payout, bank transfer, international payout,
-- BRICS Pay integration, Open Finance integration, or any external payment call.

alter table public.creator_withdrawal_requests
  add column if not exists payment_method text,
  add column if not exists payment_details jsonb,
  add column if not exists reviewed_by uuid null references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists paid_at timestamptz null,
  add column if not exists admin_notes text null,
  add column if not exists rejection_reason text null;

alter table public.creator_withdrawal_requests
  alter column pix_key drop not null,
  alter column pix_key_type drop not null,
  alter column holder_name drop not null;

update public.creator_withdrawal_requests
set
  payment_method = coalesce(payment_method, 'pix'),
  payment_details = case
    when payment_details is not null and payment_details <> '{}'::jsonb then payment_details
    else jsonb_build_object(
      'method', 'pix',
      'pixKey', coalesce(pix_key, ''),
      'pixKeyType', coalesce(pix_key_type, 'cpf'),
      'holderName', coalesce(holder_name, '')
    )
  end
where payment_method is null
  or payment_details is null
  or payment_details = '{}'::jsonb;

alter table public.creator_withdrawal_requests
  alter column payment_method set default 'pix',
  alter column payment_method set not null,
  alter column payment_details set default '{}'::jsonb,
  alter column payment_details set not null;

do $$
begin
  alter table public.creator_withdrawal_requests
    drop constraint if exists creator_withdrawal_requests_status_check;

  alter table public.creator_withdrawal_requests
    add constraint creator_withdrawal_requests_status_check
    check (status in ('pending', 'reviewing', 'approved', 'paid', 'rejected', 'cancelled'));

  alter table public.creator_withdrawal_requests
    drop constraint if exists creator_withdrawal_requests_pix_key_type_check;

  alter table public.creator_withdrawal_requests
    add constraint creator_withdrawal_requests_pix_key_type_check
    check (
      payment_method <> 'pix'
      or coalesce(pix_key_type, '') in ('cpf', 'email', 'phone', 'random', 'cnpj')
    );

  alter table public.creator_withdrawal_requests
    drop constraint if exists creator_withdrawal_requests_pix_fields_check;

  alter table public.creator_withdrawal_requests
    add constraint creator_withdrawal_requests_pix_fields_check
    check (
      payment_method <> 'pix'
      or (
        char_length(btrim(coalesce(pix_key, ''))) between 3 and 254
        and char_length(btrim(coalesce(holder_name, ''))) between 2 and 160
      )
    );

  alter table public.creator_withdrawal_requests
    drop constraint if exists creator_withdrawal_requests_payment_method_check;

  alter table public.creator_withdrawal_requests
    add constraint creator_withdrawal_requests_payment_method_check
    check (payment_method in ('pix', 'bank_transfer', 'international_manual', 'other_manual'));

  alter table public.creator_withdrawal_requests
    drop constraint if exists creator_withdrawal_requests_payment_details_check;

  alter table public.creator_withdrawal_requests
    add constraint creator_withdrawal_requests_payment_details_check
    check (
      coalesce(payment_details->>'method', payment_method) = payment_method
      and (
        (
          payment_method = 'pix'
          and coalesce(payment_details->>'pixKeyType', payment_details->>'pix_key_type', '') in ('cpf', 'email', 'phone', 'random', 'cnpj')
          and char_length(btrim(coalesce(payment_details->>'pixKey', payment_details->>'pix_key', ''))) between 3 and 254
          and char_length(btrim(coalesce(payment_details->>'holderName', payment_details->>'holder_name', ''))) between 2 and 160
        )
        or (
          payment_method = 'bank_transfer'
          and char_length(btrim(coalesce(payment_details->>'holderName', payment_details->>'holder_name', ''))) between 2 and 160
          and char_length(btrim(coalesce(payment_details->>'document', payment_details->>'holderDocument', payment_details->>'holder_document', ''))) between 3 and 32
          and char_length(btrim(coalesce(payment_details->>'bank', payment_details->>'bankName', payment_details->>'bank_name', ''))) between 2 and 80
          and char_length(btrim(coalesce(payment_details->>'agency', payment_details->>'bankAgency', payment_details->>'bank_agency', ''))) between 1 and 32
          and char_length(btrim(coalesce(payment_details->>'account', payment_details->>'bankAccount', payment_details->>'bank_account', ''))) between 1 and 48
          and coalesce(payment_details->>'accountType', payment_details->>'account_type', '') in ('checking', 'savings', 'payment')
        )
        or (
          payment_method = 'international_manual'
          and char_length(btrim(coalesce(payment_details->>'holderName', payment_details->>'holder_name', ''))) between 2 and 160
          and char_length(btrim(coalesce(payment_details->>'country', ''))) between 2 and 80
          and char_length(btrim(coalesce(payment_details->>'desiredMethod', payment_details->>'desired_method', ''))) between 2 and 120
        )
        or (
          payment_method = 'other_manual'
          and char_length(btrim(coalesce(payment_details->>'holderName', payment_details->>'holder_name', ''))) between 2 and 160
          and char_length(btrim(coalesce(payment_details->>'methodDescription', payment_details->>'method_description', payment_details->>'description', ''))) between 3 and 160
        )
      )
    );
end $$;

create index if not exists creator_withdrawal_requests_method_status_idx
  on public.creator_withdrawal_requests(payment_method, status, created_at desc);

create or replace function public.request_creator_withdrawal(
  p_amount_itacash integer,
  p_payment_method text,
  p_payment_details jsonb default '{}'::jsonb
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
  v_payment_method text := lower(nullif(btrim(p_payment_method), ''));
  v_details jsonb := coalesce(p_payment_details, '{}'::jsonb);
  v_payment_details jsonb;
  v_holder_name text;
  v_pix_key text;
  v_pix_key_type text;
  v_document text;
  v_bank text;
  v_agency text;
  v_account text;
  v_account_type text;
  v_country text;
  v_desired_method text;
  v_method_description text;
  v_notes text;
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

  if v_payment_method is null or v_payment_method not in ('pix', 'bank_transfer', 'international_manual', 'other_manual') then
    raise exception 'Invalid payment method';
  end if;

  if v_payment_method = 'pix' then
    v_pix_key_type := lower(nullif(btrim(coalesce(v_details->>'pixKeyType', v_details->>'pix_key_type', '')), ''));
    v_pix_key := nullif(btrim(coalesce(v_details->>'pixKey', v_details->>'pix_key', '')), '');
    v_holder_name := nullif(btrim(coalesce(v_details->>'holderName', v_details->>'holder_name', '')), '');

    if v_pix_key_type is null or v_pix_key_type not in ('cpf', 'email', 'phone', 'random', 'cnpj') then
      raise exception 'Invalid Pix key type';
    end if;

    if v_pix_key is null or char_length(v_pix_key) < 3 or char_length(v_pix_key) > 254 then
      raise exception 'Invalid Pix key';
    end if;

    if v_holder_name is null or char_length(v_holder_name) < 2 or char_length(v_holder_name) > 160 then
      raise exception 'Invalid payment holder name';
    end if;

    v_payment_details := jsonb_build_object(
      'method', 'pix',
      'pixKey', v_pix_key,
      'pixKeyType', v_pix_key_type,
      'holderName', v_holder_name
    );
  elsif v_payment_method = 'bank_transfer' then
    v_holder_name := nullif(btrim(coalesce(v_details->>'holderName', v_details->>'holder_name', '')), '');
    v_document := nullif(btrim(coalesce(v_details->>'document', v_details->>'holderDocument', v_details->>'holder_document', '')), '');
    v_bank := nullif(btrim(coalesce(v_details->>'bank', v_details->>'bankName', v_details->>'bank_name', '')), '');
    v_agency := nullif(btrim(coalesce(v_details->>'agency', v_details->>'bankAgency', v_details->>'bank_agency', '')), '');
    v_account := nullif(btrim(coalesce(v_details->>'account', v_details->>'bankAccount', v_details->>'bank_account', '')), '');
    v_account_type := lower(nullif(btrim(coalesce(v_details->>'accountType', v_details->>'account_type', '')), ''));
    v_notes := nullif(btrim(coalesce(v_details->>'notes', '')), '');

    if v_holder_name is null or char_length(v_holder_name) < 2 or char_length(v_holder_name) > 160 then
      raise exception 'Invalid payment holder name';
    end if;

    if v_document is null or char_length(v_document) < 3 or char_length(v_document) > 32 then
      raise exception 'Invalid payment details';
    end if;

    if v_bank is null or char_length(v_bank) < 2 or char_length(v_bank) > 80 then
      raise exception 'Invalid payment details';
    end if;

    if v_agency is null or char_length(v_agency) < 1 or char_length(v_agency) > 32 then
      raise exception 'Invalid payment details';
    end if;

    if v_account is null or char_length(v_account) < 1 or char_length(v_account) > 48 then
      raise exception 'Invalid payment details';
    end if;

    if v_account_type is null or v_account_type not in ('checking', 'savings', 'payment') then
      raise exception 'Invalid payment details';
    end if;

    v_payment_details := jsonb_strip_nulls(jsonb_build_object(
      'method', 'bank_transfer',
      'holderName', v_holder_name,
      'document', v_document,
      'bank', v_bank,
      'agency', v_agency,
      'account', v_account,
      'accountType', v_account_type,
      'notes', v_notes
    ));
  elsif v_payment_method = 'international_manual' then
    v_holder_name := nullif(btrim(coalesce(v_details->>'holderName', v_details->>'holder_name', '')), '');
    v_country := nullif(btrim(coalesce(v_details->>'country', '')), '');
    v_desired_method := nullif(btrim(coalesce(v_details->>'desiredMethod', v_details->>'desired_method', '')), '');
    v_notes := nullif(btrim(coalesce(v_details->>'notes', '')), '');

    if v_holder_name is null or char_length(v_holder_name) < 2 or char_length(v_holder_name) > 160 then
      raise exception 'Invalid payment holder name';
    end if;

    if v_country is null or char_length(v_country) < 2 or char_length(v_country) > 80 then
      raise exception 'Invalid international payment details';
    end if;

    if v_desired_method is null or char_length(v_desired_method) < 2 or char_length(v_desired_method) > 120 then
      raise exception 'Invalid international payment details';
    end if;

    v_payment_details := jsonb_strip_nulls(jsonb_build_object(
      'method', 'international_manual',
      'holderName', v_holder_name,
      'country', v_country,
      'desiredMethod', v_desired_method,
      'notes', v_notes
    ));
  else
    v_holder_name := nullif(btrim(coalesce(v_details->>'holderName', v_details->>'holder_name', '')), '');
    v_method_description := nullif(btrim(coalesce(v_details->>'methodDescription', v_details->>'method_description', v_details->>'description', '')), '');
    v_notes := nullif(btrim(coalesce(v_details->>'notes', '')), '');

    if v_holder_name is null or char_length(v_holder_name) < 2 or char_length(v_holder_name) > 160 then
      raise exception 'Invalid payment holder name';
    end if;

    if v_method_description is null or char_length(v_method_description) < 3 or char_length(v_method_description) > 160 then
      raise exception 'Invalid payment details';
    end if;

    v_payment_details := jsonb_strip_nulls(jsonb_build_object(
      'method', 'other_manual',
      'holderName', v_holder_name,
      'methodDescription', v_method_description,
      'notes', v_notes
    ));
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
    payment_method,
    payment_details,
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
    v_payment_method,
    v_payment_details,
    case when v_payment_method = 'pix' then v_pix_key else null end,
    case when v_payment_method = 'pix' then v_pix_key_type else null end,
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
      'payment_method', v_payment_method
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
    'payment_method', v_payment_method,
    'status', 'pending'
  );
end;
$$;

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
begin
  return public.request_creator_withdrawal(
    p_amount_itacash,
    'pix',
    jsonb_build_object(
      'method', 'pix',
      'pixKey', p_pix_key,
      'pixKeyType', p_pix_key_type,
      'holderName', p_holder_name
    )
  );
end;
$$;

create or replace function public.set_creator_withdrawal_reviewing(
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
    raise exception 'Only pending withdrawal requests can be marked in review';
  end if;

  update public.creator_withdrawal_requests
  set
    status = 'reviewing',
    reviewed_by = v_admin_id,
    reviewed_at = v_reviewed_at,
    paid_at = null,
    admin_notes = nullif(btrim(p_admin_notes), ''),
    rejection_reason = null
  where id = v_request.id;

  return jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'status', 'reviewing'
  );
end;
$$;

create or replace function public.approve_creator_withdrawal(
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

  if v_request.status not in ('pending', 'reviewing') then
    raise exception 'Only pending or reviewing withdrawal requests can be approved';
  end if;

  update public.creator_withdrawal_requests
  set
    status = 'approved',
    reviewed_by = v_admin_id,
    reviewed_at = v_reviewed_at,
    paid_at = null,
    admin_notes = nullif(btrim(p_admin_notes), ''),
    rejection_reason = null
  where id = v_request.id;

  return jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'status', 'approved'
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

  if v_request.status not in ('pending', 'reviewing', 'approved') then
    raise exception 'Only open withdrawal requests can be rejected';
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

  if v_request.status not in ('pending', 'reviewing', 'approved') then
    raise exception 'Only open withdrawal requests can be marked as paid';
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

revoke all on function public.request_creator_withdrawal(integer, text, jsonb) from public;
revoke all on function public.request_creator_withdrawal(integer, text, text, text) from public;
revoke all on function public.set_creator_withdrawal_reviewing(uuid, text) from public;
revoke all on function public.approve_creator_withdrawal(uuid, text) from public;
revoke all on function public.reject_creator_withdrawal(uuid, text) from public;
revoke all on function public.mark_creator_withdrawal_paid(uuid, text) from public;

grant execute on function public.request_creator_withdrawal(integer, text, jsonb) to authenticated;
grant execute on function public.request_creator_withdrawal(integer, text, text, text) to authenticated;
grant execute on function public.set_creator_withdrawal_reviewing(uuid, text) to authenticated;
grant execute on function public.approve_creator_withdrawal(uuid, text) to authenticated;
grant execute on function public.reject_creator_withdrawal(uuid, text) to authenticated;
grant execute on function public.mark_creator_withdrawal_paid(uuid, text) to authenticated;

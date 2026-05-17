-- Prepared migration for ItaCash wallets and digital gifts.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.itacash_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  balance integer not null default 0,
  locked_balance integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id),
  constraint itacash_wallets_balance_check check (balance >= 0),
  constraint itacash_wallets_locked_balance_check check (locked_balance >= 0)
);

create table if not exists public.itacash_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.itacash_wallets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  amount integer not null,
  balance_after integer not null,
  description text null,
  reference_type text null,
  reference_id uuid null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint itacash_transactions_type_check
    check (type in ('admin_credit', 'reward', 'gift_sent', 'gift_received', 'refund', 'adjustment'))
);

create table if not exists public.digital_gifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  price_itacash integer not null,
  media_url text null,
  media_type text not null default 'image',
  category text not null default 'standard',
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint digital_gifts_price_check check (price_itacash > 0),
  constraint digital_gifts_media_type_check check (media_type in ('image', 'emoji', 'video'))
);

create table if not exists public.user_gifts (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.digital_gifts(id) on delete restrict,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  message text null,
  visibility text not null default 'public',
  price_paid_itacash integer not null,
  created_at timestamptz default now(),
  constraint user_gifts_visibility_check check (visibility in ('public', 'private')),
  constraint user_gifts_price_check check (price_paid_itacash > 0)
);

create index if not exists itacash_wallets_user_id_idx
  on public.itacash_wallets(user_id);

create index if not exists itacash_transactions_user_created_at_idx
  on public.itacash_transactions(user_id, created_at desc);

create index if not exists itacash_transactions_wallet_created_at_idx
  on public.itacash_transactions(wallet_id, created_at desc);

create index if not exists digital_gifts_active_order_idx
  on public.digital_gifts(is_active, sort_order, name);

create index if not exists user_gifts_sender_created_at_idx
  on public.user_gifts(sender_id, created_at desc);

create index if not exists user_gifts_receiver_created_at_idx
  on public.user_gifts(receiver_id, created_at desc);

create index if not exists user_gifts_public_created_at_idx
  on public.user_gifts(visibility, created_at desc)
  where visibility = 'public';

create or replace function public.set_itacash_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_itacash_wallets_updated_at
  on public.itacash_wallets;

create trigger set_itacash_wallets_updated_at
  before update on public.itacash_wallets
  for each row
  execute function public.set_itacash_updated_at();

drop trigger if exists set_digital_gifts_updated_at
  on public.digital_gifts;

create trigger set_digital_gifts_updated_at
  before update on public.digital_gifts
  for each row
  execute function public.set_itacash_updated_at();

alter table public.itacash_wallets enable row level security;
alter table public.itacash_transactions enable row level security;
alter table public.digital_gifts enable row level security;
alter table public.user_gifts enable row level security;

drop policy if exists "Users can read own ItaCash wallet"
  on public.itacash_wallets;

create policy "Users can read own ItaCash wallet"
  on public.itacash_wallets
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own ItaCash transactions"
  on public.itacash_transactions;

create policy "Users can read own ItaCash transactions"
  on public.itacash_transactions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Authenticated users can read active digital gifts"
  on public.digital_gifts;

create policy "Authenticated users can read active digital gifts"
  on public.digital_gifts
  for select
  to authenticated
  using (is_active = true);

drop policy if exists "Users can read visible user gifts"
  on public.user_gifts;

create policy "Users can read visible user gifts"
  on public.user_gifts
  for select
  to authenticated
  using (
    visibility = 'public'
    or auth.uid() = sender_id
    or auth.uid() = receiver_id
  );

create or replace function public.ensure_itacash_wallet()
returns public.itacash_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.itacash_wallets;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.itacash_wallets (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from public.itacash_wallets
  where user_id = v_user_id;

  return v_wallet;
end;
$$;

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

  return jsonb_build_object(
    'success', true,
    'user_gift_id', v_user_gift_id,
    'sender_balance_after', v_sender_balance_after,
    'receiver_balance_after', v_receiver_balance_after
  );
end;
$$;

grant execute on function public.ensure_itacash_wallet() to authenticated;
grant execute on function public.send_digital_gift(uuid, uuid, text, text) to authenticated;

insert into public.digital_gifts (
  name,
  slug,
  description,
  price_itacash,
  media_type,
  category,
  sort_order
)
values
  ('Rosa Digital', 'rosa-digital', 'Um gesto simples e carinhoso para reconhecer alguem.', 5, 'emoji', 'standard', 10),
  ('Cafe Virtual', 'cafe-virtual', 'Um cafe simbolico para apoiar uma boa ideia.', 10, 'emoji', 'standard', 20),
  ('Coracao EntreUS', 'coracao-entreus', 'Um presente afetivo para posts e perfis especiais.', 15, 'emoji', 'standard', 30),
  ('Aplausos', 'aplausos', 'Aplausos digitais para celebrar contribuicoes da comunidade.', 20, 'emoji', 'standard', 40),
  ('Foguete de Apoio', 'foguete-de-apoio', 'Um impulso visual para incentivar alguem.', 25, 'emoji', 'premium', 50),
  ('Trofeu Destaque', 'trofeu-destaque', 'Reconhecimento para quem brilhou na comunidade.', 50, 'emoji', 'premium', 60),
  ('Diamante Premium', 'diamante-premium', 'Um presente especial para momentos memoraveis.', 100, 'emoji', 'premium', 70),
  ('Coroa Elite', 'coroa-elite', 'Um simbolo de destaque maximo dentro da comunidade.', 250, 'emoji', 'elite', 80)
on conflict (slug) do nothing;

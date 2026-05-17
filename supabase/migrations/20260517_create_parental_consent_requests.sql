-- Prepared migration for parental consent request flow.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

create table if not exists public.parental_consent_requests (
  id uuid primary key default gen_random_uuid(),
  child_user_id uuid not null references auth.users(id) on delete cascade,
  guardian_email text not null,
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending',
  child_birth_date date null,
  consent_text text null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  expires_at timestamptz default now() + interval '30 days',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint parental_consent_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  constraint parental_consent_requests_token_unique unique (token)
);

create index if not exists parental_consent_requests_child_user_id_idx
  on public.parental_consent_requests(child_user_id);

create index if not exists parental_consent_requests_guardian_email_idx
  on public.parental_consent_requests(guardian_email);

create index if not exists parental_consent_requests_token_idx
  on public.parental_consent_requests(token);

create index if not exists parental_consent_requests_status_idx
  on public.parental_consent_requests(status);

create or replace function public.set_parental_consent_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_parental_consent_requests_updated_at
  on public.parental_consent_requests;

create trigger set_parental_consent_requests_updated_at
  before update on public.parental_consent_requests
  for each row
  execute function public.set_parental_consent_requests_updated_at();

alter table public.parental_consent_requests enable row level security;

drop policy if exists "Users can read their own parental consent requests"
  on public.parental_consent_requests;

create policy "Users can read their own parental consent requests"
  on public.parental_consent_requests
  for select
  to authenticated
  using (child_user_id = auth.uid());

drop policy if exists "Users can create their own parental consent requests"
  on public.parental_consent_requests;

create policy "Users can create their own parental consent requests"
  on public.parental_consent_requests
  for insert
  to authenticated
  with check (child_user_id = auth.uid() and status = 'pending');

drop policy if exists "Users cannot update parental consent requests directly"
  on public.parental_consent_requests;

create policy "Users cannot update parental consent requests directly"
  on public.parental_consent_requests
  for update
  to authenticated
  using (false)
  with check (false);

create or replace function public.get_parental_consent_request(p_token uuid)
returns table (
  id uuid,
  guardian_email text,
  status text,
  child_birth_date date,
  consent_text text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    request.id,
    request.guardian_email,
    case
      when request.status = 'pending' and request.expires_at < now() then 'expired'
      else request.status
    end as status,
    request.child_birth_date,
    request.consent_text,
    request.expires_at,
    request.created_at
  from public.parental_consent_requests request
  where request.token = p_token;
end;
$$;

create or replace function public.submit_parental_consent(
  p_token uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.parental_consent_requests;
  v_next_status text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decisao invalida.';
  end if;

  select *
  into v_request
  from public.parental_consent_requests
  where token = p_token
  for update;

  if not found then
    raise exception 'Solicitacao invalida ou inexistente.';
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object(
      'success', true,
      'status', v_request.status,
      'message', 'Solicitacao ja processada.'
    );
  end if;

  if auth.uid() is not null and auth.uid() = v_request.child_user_id then
    raise exception 'O usuario menor nao pode aprovar a propria solicitacao.';
  end if;

  if v_request.expires_at < now() then
    update public.parental_consent_requests
    set status = 'expired'
    where id = v_request.id;

    update public.profiles
    set parental_consent_status = 'pending'
    where id = v_request.child_user_id
      and parental_consent_status <> 'approved';

    return jsonb_build_object(
      'success', false,
      'status', 'expired',
      'message', 'Link expirado.'
    );
  end if;

  v_next_status := p_decision;

  update public.parental_consent_requests
  set
    status = v_next_status,
    approved_at = case when v_next_status = 'approved' then now() else approved_at end,
    rejected_at = case when v_next_status = 'rejected' then now() else rejected_at end
  where id = v_request.id;

  update public.profiles
  set parental_consent_status = v_next_status
  where id = v_request.child_user_id;

  return jsonb_build_object(
    'success', true,
    'status', v_next_status,
    'message', case
      when v_next_status = 'approved' then 'Autorizacao aprovada.'
      else 'Autorizacao recusada.'
    end
  );
end;
$$;

grant execute on function public.get_parental_consent_request(uuid) to anon, authenticated;
grant execute on function public.submit_parental_consent(uuid, text) to anon, authenticated;

alter table public.profiles
  add column if not exists vip_source text not null default 'none',
  add column if not exists vip_granted_by uuid null references auth.users(id) on delete set null,
  add column if not exists vip_reason text null,
  add column if not exists vip_updated_at timestamptz null;

do $$
begin
  alter table public.profiles
    drop constraint if exists profiles_vip_source_check;

  alter table public.profiles
    add constraint profiles_vip_source_check
    check (vip_source in ('none', 'admin', 'payment', 'promo'));
end $$;

create index if not exists profiles_vip_status_expires_at_idx
  on public.profiles(vip_status, vip_expires_at)
  where vip_status is not null;

-- Pacote 33: tema visual predefinido para perfis VIP, VIP Premium e Anciao.
-- Esta migration apenas adiciona o campo e limita os valores aceitos.
-- A regra de acesso por tier continua validada na aplicacao/rota de atualizacao.

alter table public.profiles
  add column if not exists profile_theme text not null default 'default';

update public.profiles
set profile_theme = 'default'
where profile_theme is null
  or profile_theme not in (
    'default',
    'vip-blue',
    'vip-neon',
    'vip-premium-fuchsia',
    'elder-gold',
    'elder-royal'
  );

do $$
begin
  alter table public.profiles
    drop constraint if exists profiles_profile_theme_check;

  alter table public.profiles
    add constraint profiles_profile_theme_check
    check (
      profile_theme in (
        'default',
        'vip-blue',
        'vip-neon',
        'vip-premium-fuchsia',
        'elder-gold',
        'elder-royal'
      )
    );
end $$;

comment on column public.profiles.profile_theme is
  'Tema visual predefinido do perfil. Valores VIP/Anciao sao validados pela aplicacao antes de salvar.';

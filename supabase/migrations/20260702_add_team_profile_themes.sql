-- Pacote 44: libera temas de torcida para profile_theme.
-- Nao aplica acesso por tier no banco; a regra continua na aplicacao.

update public.profiles
set profile_theme = 'default'
where profile_theme is null
  or profile_theme not in (
    'default',
    'vip-blue',
    'vip-neon',
    'vip-premium-fuchsia',
    'elder-gold',
    'elder-royal',
    'team-brazil',
    'team-argentina',
    'team-france',
    'team-portugal',
    'team-germany',
    'team-congo',
    'team-japan',
    'team-usa'
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
        'elder-royal',
        'team-brazil',
        'team-argentina',
        'team-france',
        'team-portugal',
        'team-germany',
        'team-congo',
        'team-japan',
        'team-usa'
      )
    );
end $$;

comment on column public.profiles.profile_theme is
  'Tema visual predefinido do perfil. Temas de torcida sao livres; valores VIP/Anciao sao validados pela aplicacao antes de salvar.';

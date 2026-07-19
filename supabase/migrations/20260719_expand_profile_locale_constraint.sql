-- Pacote 53: compatibilidade para ambientes que aplicaram a constraint antiga.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'interface_locale'
  ) then
    update public.profiles
    set interface_locale = 'pt-BR'
    where interface_locale not in ('pt-BR', 'en', 'es', 'fr', 'id', 'ko', 'ja', 'zh-CN');

    alter table public.profiles
      drop constraint if exists profiles_interface_locale_check;

    alter table public.profiles
      add constraint profiles_interface_locale_check
        check (interface_locale in ('pt-BR', 'en', 'es', 'fr', 'id', 'ko', 'ja', 'zh-CN'));
  end if;
end
$$;

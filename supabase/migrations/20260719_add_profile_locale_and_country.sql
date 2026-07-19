-- Pacote 53: preferencia global de idioma e pais ISO do perfil.
alter table public.profiles
  add column if not exists interface_locale text not null default 'pt-BR',
  add column if not exists country_code text;

update public.profiles
set interface_locale = 'pt-BR'
where interface_locale not in ('pt-BR', 'en', 'es', 'fr', 'id', 'ko', 'ja', 'zh-CN');

update public.profiles
set country_code = null
where country_code is not null
  and country_code !~ '^[A-Z]{2}$';

alter table public.profiles
  drop constraint if exists profiles_interface_locale_check,
  add constraint profiles_interface_locale_check
    check (interface_locale in ('pt-BR', 'en', 'es', 'fr', 'id', 'ko', 'ja', 'zh-CN')),
  drop constraint if exists profiles_country_code_check,
  add constraint profiles_country_code_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$');

comment on column public.profiles.interface_locale is
  'Idioma da interface; nao altera o idioma original do conteudo publicado.';
comment on column public.profiles.country_code is
  'Codigo de pais ISO 3166-1 alpha-2 opcional, separado do idioma da interface.';

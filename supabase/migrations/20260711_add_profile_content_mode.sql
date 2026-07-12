-- Modo declarado pelo criador para orientar a experiencia do perfil.
-- Este campo nao reclassifica posts e nao substitui as regras por publicacao.

alter table public.profiles
  add column if not exists profile_content_mode text;

alter table public.profiles
  alter column profile_content_mode set default 'general';

update public.profiles
set profile_content_mode = 'general'
where profile_content_mode is null
   or profile_content_mode not in ('general', 'adult', 'mixed');

alter table public.profiles
  alter column profile_content_mode set not null;

alter table public.profiles
  drop constraint if exists profiles_profile_content_mode_check;

alter table public.profiles
  add constraint profiles_profile_content_mode_check
  check (profile_content_mode in ('general', 'adult', 'mixed'));

comment on column public.profiles.profile_content_mode is
  'Modo declarado pelo criador para orientar interface, Composer e moderacao futura. Nao substitui a classificacao individual de cada post.';

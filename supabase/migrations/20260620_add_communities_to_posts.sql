-- Pacote 34: base de comunidades/nichos e classificacao de seguranca dos posts.
-- Posts antigos permanecem com defaults seguros: general + safe.
-- A migration nao altera RLS neste pacote.

alter table public.posts
  add column if not exists community_type text not null default 'general',
  add column if not exists content_rating text not null default 'safe';

update public.posts
set
  community_type = coalesce(nullif(community_type, ''), 'general'),
  content_rating = coalesce(nullif(content_rating, ''), 'safe')
where community_type is null
  or community_type = ''
  or content_rating is null
  or content_rating = '';

update public.posts
set
  community_type = 'general'
where community_type not in (
  'general',
  'sports',
  'geopolitics',
  'military',
  'adult_18plus'
);

update public.posts
set
  content_rating = 'safe'
where content_rating not in (
  'safe',
  'sensitive',
  'adult_18plus'
);

update public.posts
set content_rating = 'adult_18plus'
where community_type = 'adult_18plus'
  and content_rating <> 'adult_18plus';

do $$
begin
  alter table public.posts
    drop constraint if exists posts_community_type_check;

  alter table public.posts
    add constraint posts_community_type_check
    check (
      community_type in (
        'general',
        'sports',
        'geopolitics',
        'military',
        'adult_18plus'
      )
    );

  alter table public.posts
    drop constraint if exists posts_content_rating_check;

  alter table public.posts
    add constraint posts_content_rating_check
    check (
      content_rating in (
        'safe',
        'sensitive',
        'adult_18plus'
      )
    );

  alter table public.posts
    drop constraint if exists posts_adult_community_rating_check;

  alter table public.posts
    add constraint posts_adult_community_rating_check
    check (
      community_type <> 'adult_18plus'
      or content_rating = 'adult_18plus'
    );
end $$;

create index if not exists posts_community_type_created_at_idx
  on public.posts(community_type, created_at desc);

create index if not exists posts_content_rating_created_at_idx
  on public.posts(content_rating, created_at desc);

comment on column public.posts.community_type is
  'Comunidade/nicho do post: general, sports, geopolitics, military ou adult_18plus.';

comment on column public.posts.content_rating is
  'Classificacao de seguranca do post: safe, sensitive ou adult_18plus.';

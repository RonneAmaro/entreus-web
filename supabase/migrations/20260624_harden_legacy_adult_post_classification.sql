-- Pacote 35: make legacy adult categories subject to the same 18+ controls.
-- Apply together with 20260621_harden_adult_content_rls.sql in a reviewed
-- environment. This migration does not move or delete storage objects.

update public.posts
set
  community_type = 'adult_18plus',
  content_rating = 'adult_18plus'
where
  community_type = 'adult_18plus'
  or content_rating = 'adult_18plus'
  or lower(btrim(coalesce(category, ''))) in ('adulto', 'sensual', '18plus');

alter table public.posts
  drop constraint if exists posts_adult_community_rating_check;

alter table public.posts
  add constraint posts_adult_community_rating_check
  check (
    (community_type = 'adult_18plus' and content_rating = 'adult_18plus')
    or (community_type <> 'adult_18plus' and content_rating <> 'adult_18plus')
  );

alter table public.posts
  drop constraint if exists posts_legacy_adult_category_classification_check;

alter table public.posts
  add constraint posts_legacy_adult_category_classification_check
  check (
    lower(btrim(coalesce(category, ''))) not in ('adulto', 'sensual', '18plus')
    or (community_type = 'adult_18plus' and content_rating = 'adult_18plus')
  );

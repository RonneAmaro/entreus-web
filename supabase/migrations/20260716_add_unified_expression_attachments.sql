-- Pacote 51: metadados minimos de GIF/sticker, preparados para aplicacao manual.
-- No secrets, raw provider payloads or arbitrary HTML are stored.

create or replace function public.is_valid_expression_asset(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null then true
    when jsonb_typeof(value) <> 'object' then false
    else coalesce(
      value ?& array[
        'kind', 'provider', 'providerId', 'title', 'altText',
        'contentRating', 'mediaUrl', 'previewUrl'
      ]
      and not exists (
        select 1
        from jsonb_object_keys(value) as expression_key(key)
        where expression_key.key <> all (array[
          'kind', 'provider', 'providerId', 'title', 'altText',
          'contentRating', 'mediaUrl', 'previewUrl', 'staticUrl',
          'attributionUrl', 'width', 'height'
        ])
      )
      and jsonb_typeof(value->'kind') = 'string'
      and value->>'kind' in ('gif', 'sticker')
      and jsonb_typeof(value->'provider') = 'string'
      and value->>'provider' = 'tenor'
      and jsonb_typeof(value->'providerId') = 'string'
      and value->>'providerId' ~ '^[A-Za-z0-9_-]{1,80}$'
      and jsonb_typeof(value->'title') = 'string'
      and length(value->>'title') between 1 and 160
      and jsonb_typeof(value->'altText') = 'string'
      and length(value->>'altText') between 1 and 160
      and jsonb_typeof(value->'contentRating') = 'string'
      and value->>'contentRating' = 'g'
      and jsonb_typeof(value->'mediaUrl') = 'string'
      and length(value->>'mediaUrl') between 1 and 2048
      and value->>'mediaUrl' ~ '^https://media[.]tenor[.]com(?:/|$)'
      and jsonb_typeof(value->'previewUrl') = 'string'
      and length(value->>'previewUrl') between 1 and 2048
      and value->>'previewUrl' ~ '^https://media[.]tenor[.]com(?:/|$)'
      and (
        not (value ? 'staticUrl')
        or (
          jsonb_typeof(value->'staticUrl') = 'string'
          and length(value->>'staticUrl') between 1 and 2048
          and value->>'staticUrl' ~ '^https://media[.]tenor[.]com(?:/|$)'
        )
      )
      and (
        not (value ? 'attributionUrl')
        or (
          jsonb_typeof(value->'attributionUrl') = 'string'
          and value->>'attributionUrl' = 'https://tenor.com/'
        )
      )
      and (
        not (value ? 'width')
        or (
          jsonb_typeof(value->'width') = 'number'
          and value->>'width' ~ '^[0-9]+$'
          and (value->>'width')::numeric between 1 and 10000
        )
      )
      and (
        not (value ? 'height')
        or (
          jsonb_typeof(value->'height') = 'number'
          and value->>'height' ~ '^[0-9]+$'
          and (value->>'height')::numeric between 1 and 10000
        )
      ),
      false
    )
  end
$$;

revoke all on function public.is_valid_expression_asset(jsonb) from public;
grant execute on function public.is_valid_expression_asset(jsonb) to authenticated, service_role;

alter table public.posts add column if not exists expression jsonb null;
alter table public.comments add column if not exists expression jsonb null;
alter table public.messages add column if not exists expression jsonb null;
alter table public.meet_room_chat_messages add column if not exists expression jsonb null;

alter table public.posts drop constraint if exists posts_expression_check;
alter table public.posts add constraint posts_expression_check check (public.is_valid_expression_asset(expression));
alter table public.comments drop constraint if exists comments_expression_check;
alter table public.comments add constraint comments_expression_check check (public.is_valid_expression_asset(expression));
alter table public.messages drop constraint if exists messages_expression_check;
alter table public.messages add constraint messages_expression_check check (public.is_valid_expression_asset(expression));
alter table public.meet_room_chat_messages drop constraint if exists meet_room_chat_messages_expression_check;
alter table public.meet_room_chat_messages add constraint meet_room_chat_messages_expression_check check (public.is_valid_expression_asset(expression));

comment on column public.posts.expression is 'Canonical validated GIF/sticker metadata; emoji remains Unicode in content.';
comment on column public.comments.expression is 'Canonical validated GIF/sticker metadata; emoji remains Unicode in content.';
comment on column public.messages.expression is 'Canonical validated GIF/sticker metadata; emoji remains Unicode in content.';
comment on column public.meet_room_chat_messages.expression is 'Canonical validated GIF/sticker metadata; emoji remains Unicode in content.';

-- Existing RLS policies remain authoritative because no new table or privilege is introduced.

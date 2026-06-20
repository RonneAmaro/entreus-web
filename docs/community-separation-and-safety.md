# Separacao de comunidades e seguranca

## Objetivo

O Pacote 34 cria a base para separar nichos de conteudo no EntreUS. O foco e classificar posts por comunidade, filtrar o feed e iniciar isolamento de conteudo adulto 18+ sem criar ainda um sistema completo de grupos, membros, donos ou moderacao por comunidade.

## Comunidades iniciais

- `general`: Geral.
- `sports`: Esportes.
- `geopolitics`: Geopolitica.
- `military`: Militar.
- `adult_18plus`: Adulto 18+.

## Comunidade vs classificacao

Comunidade define onde o post deve aparecer. Classificacao de seguranca define o nivel de cuidado do conteudo.

- `safe`: seguro/geral.
- `sensitive`: sensivel, mas nao adulto.
- `adult_18plus`: adulto 18+.

Geopolitica e Militar podem usar `sensitive`, mas nao sao tratados automaticamente como adulto. A comunidade `adult_18plus` sempre forca `content_rating = 'adult_18plus'`.

## Isolamento adulto

Conteudo adulto nao entra no filtro "Todos" do feed. O filtro Adulto 18+ so aparece para usuarios com:

- `is_minor = false`;
- `wants_18_plus = true`;
- `age_verification_status = 'approved'`.

Usuario nao logado, menor ou sem verificacao aprovada nao deve receber posts `adult_18plus` no feed, perfil publico, post individual ou salvos. Consentimento parental nao libera adulto.

## Migration

Foi criada a migration:

`supabase/migrations/20260620_add_communities_to_posts.sql`

Campos adicionados em `public.posts`:

- `community_type text not null default 'general'`;
- `content_rating text not null default 'safe'`.

Constraints:

- `posts_community_type_check`;
- `posts_content_rating_check`;
- `posts_adult_community_rating_check`.

A migration nao foi aplicada automaticamente. Antes de testar persistencia real, aplique no Supabase do ambiente desejado. O codigo tem fallback para o schema antigo, mas sem a migration os campos novos nao serao persistidos.

## Onde aparece

- Composer: seletores de comunidade e classificacao.
- Feed: filtro por comunidade, com 18+ fora de "Todos".
- PostCard/feed: tag discreta de comunidade e marcador de sensivel/18+.
- Perfil publico, post individual e salvos: bloqueio de adulto para quem nao pode ver.

## Como testar

1. Criar post padrao sem escolher comunidade e confirmar `general/safe`.
2. Criar post em Esportes e filtrar por Esportes.
3. Criar post em Geopolitica e confirmar marcador sensivel.
4. Criar post em Militar e confirmar marcador sensivel.
5. Com usuario menor ou sem verificacao, tentar escolher Adulto 18+ e confirmar bloqueio.
6. Confirmar que "Todos" nao mistura Adulto 18+.
7. Confirmar que perfil publico nao mostra Adulto 18+ para usuario sem permissao.
8. Confirmar que `/post/[id]` bloqueia link direto adulto para usuario sem permissao.
9. Confirmar que Salvos nao renderiza adulto para menor/nao verificado.
10. Testar mobile no composer e filtro do feed.
11. Confirmar que upload de midia continua funcionando.

## Proximos pacotes recomendados

- isolamento 18+ mais rigido em RLS/RPC;
- onboarding de criadores por comunidade;
- moderacao por comunidade;
- termos especificos por comunidade;
- denuncias por nicho;
- pagina dedicada para ambiente Adulto 18+ com avisos e consentimentos proprios.

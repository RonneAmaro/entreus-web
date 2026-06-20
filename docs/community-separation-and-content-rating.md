# Separacao de comunidades e classificacao de conteudo

## Objetivo

O Pacote 34 separa o feed por nichos e reforca a protecao de conteudo adulto. O feed geral deixa de ser um balaio unico: por padrao ele mostra apenas posts `general` com `content_rating = safe`.

## Campos reaproveitados

A tabela `public.posts` ja possui:

- `community_type text default 'general'`
- `content_rating text default 'safe'`

Nao foi criada migration nova para estes campos neste ajuste.

## Valores aceitos pelas constraints

Valores aceitos por `posts_community_type_check`:

- `general`
- `sports`
- `geopolitics`
- `military`
- `adult_18plus`

Valores aceitos por `posts_content_rating_check`:

- `safe`
- `sensitive`
- `adult_18plus`

A constraint `posts_adult_community_rating_check` exige que posts da comunidade `adult_18plus` tambem tenham `content_rating = adult_18plus`.

## Comunidades

- `general`: Geral.
- `sports`: Esportes.
- `geopolitics`: Geopolitica.
- `military`: Militar.
- `adult_18plus`: Adulto 18+.

## Classificacoes

- `safe`: conteudo seguro para areas comuns.
- `sensitive`: conteudo sensivel, mas nao adulto.
- `adult_18plus`: conteudo adulto isolado.

## Regras do feed

- O feed inicia em `Geral`.
- `Geral` busca apenas `community_type = general` e `content_rating = safe`.
- Esportes, Geopolitica e Militar aparecem por filtro explicito.
- O filtro 18+ so aparece para usuarios com verificacao aprovada.
- Conteudo adulto nunca entra no feed geral.

## Regra 18+

Para ver ou publicar em `adult_18plus`, o usuario precisa:

- nao ser menor (`is_minor = false`);
- ter optado por 18+ (`wants_18_plus = true`);
- ter verificacao aprovada (`age_verification_status = approved`).

Se houver duvida, o sistema bloqueia por padrao. Consentimento parental nao libera conteudo adulto.

## Onde a regra e aplicada

- Composer salva `community_type` e `content_rating`.
- Feed filtra na consulta quando as colunas existem.
- Perfil publico nao lista adulto para usuario sem autorizacao.
- Pagina individual de post bloqueia adulto para usuario sem autorizacao.
- Salvos tambem filtra adulto para menor/nao verificado.
- PostCard mostra etiquetas discretas de comunidade e classificacao.

## Limitacoes

- A busca atual lista perfis, nao posts; nao havia resultado de post adulto para filtrar.
- Admin/moderacao ainda nao ganhou painel dedicado para reclassificar comunidade/rating.
- A separacao forte por RLS/RPC deve ser feita em pacote futuro.

## Testes manuais

- Criar post Geral/Safe.
- Criar post Esportes/Safe.
- Tentar criar Adulto 18+ sem verificacao.
- Verificar feed geral sem conteudo adulto ou sensivel.
- Verificar filtro Esportes.
- Verificar perfil publico sem misturar adulto.
- Verificar post direto adulto bloqueado para nao autorizado.
- Verificar usuario menor bloqueado.
- Verificar mobile/responsivo.
- Verificar post antigo com fallback `general/safe`.

## Proximos passos

- Painel admin para reclassificar post.
- Paginas proprias de comunidades.
- Onboarding de criadores por nicho.
- Termos especificos para conteudo sensivel/adulto.
- Isolamento mais forte em RLS/RPC.

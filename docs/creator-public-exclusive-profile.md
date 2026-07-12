# Perfil publico e area exclusiva de criadores

Este pacote implementa a primeira versao da experiencia de uma conta e uma identidade para criadores. O perfil continua sendo uma unica pagina publica, enquanto conteudos pagos, adultos ou exclusivos ficam em uma area separada e protegida.

## Conceito

O criador nao ganha uma segunda conta nem um segundo perfil. A separacao acontece por area de experiencia:

- `Publicacoes`: presenca publica, bio, avatar, capa, posts seguros e gratuitos.
- `Exclusivo`: conteudos pagos, midias premium e publicacoes 18+ quando o visitante esta autorizado.

Avatar e capa seguem tratados como conteudo publico seguro. Um pacote futuro pode adicionar avatar/capa adultos separados, mas esta versao nao faz troca automatica nem moderacao externa de imagens.

## Regras de acesso

A area publica nao lista posts adultos nem posts pagos. A area exclusiva usa o helper `lib/creator-profile-access.ts`, que centraliza:

- separacao de posts publicos e exclusivos;
- estado de acesso da area exclusiva;
- sanitizacao de posts pagos bloqueados;
- bloqueio de listagem adulta para deslogados, menores, usuarios sem verificacao 18+ ou sem opt-in;
- permissao do proprio criador para ver o conteudo sem comprar o proprio post.

A listagem de posts do perfil publico usa a route handler `app/api/creator-profile/[username]/posts/route.ts`. O client component nao consulta mais `posts`, `post_media` ou `paid_post_unlocks` diretamente para montar a experiencia do perfil.

A route usa o Supabase anon key com o header `Authorization` da sessao quando existir. Isso preserva RLS e evita service role no navegador. A route pode ler dados suficientes no servidor para decidir acesso, mas devolve ao navegador somente o payload ja filtrado e sanitizado por `lib/creator-profile-access.ts`.

## Posts pagos

Posts pagos entram na area `Exclusivo`. Quando bloqueados:

- `content`, `image_url`, `video_url` e `media` sao removidos;
- o preco em ItaCash permanece disponivel;
- o desbloqueio continua passando pela rota e RPC existentes;
- o criador nao pode comprar o proprio post.

Quando desbloqueados, o comprador recebe o conteudo sanitizado como autorizado. Midias protegidas continuam dependendo da rota de signed URL existente, que valida adulto, visibilidade e desbloqueio antes de assinar R2.

Posts pagos seguros e nao adultos nao exigem autorizacao 18+. Usuarios autenticados podem receber um card de paywall seguro sem texto completo, imagens, videos ou itens de midia.

## Conteudo adulto

Conteudo adulto segue a classificacao individual do post (`community_type`, `content_rating` e categorias legadas). A classificacao do perfil nao transforma automaticamente todos os posts em adultos.

O acesso adulto exige:

- usuario autenticado;
- `is_minor = false`;
- `age_verification_status = approved`;
- `wants_18_plus = true`.

Consentimento parental nao libera conteudo adulto.

Posts adultos nao autorizados ficam ausentes do payload da route. Posts adultos pagos passam primeiro pela autorizacao adulta e depois pelo paywall.

## Reposts

Reposts usam as mesmas regras do post original. A autoria e calculada pelo autor do post original, nao pelo perfil que repostou. Se o post original nao puder ser retornado, o repost tambem e removido do payload.

## Migration revisavel

Foi criada a migration `supabase/migrations/20260711_add_profile_content_mode.sql` com o campo `profile_content_mode`:

- `general`;
- `adult`;
- `mixed`.

A migration nao foi aplicada. O campo serve para comunicacao e configuracao futura do perfil, mas nao substitui a classificacao por post.

Detalhes da configuracao e do fallback sem migration estao em `docs/creator-profile-content-mode.md`.

## Limitacoes atuais

- A pagina publica ainda e um client component, mas a listagem sensivel de posts foi movida para uma route handler server-side.
- Nao foi criado RPC dedicado para listar perfil publico/exclusivo; a route handler e a fronteira segura desta versao.
- Nao ha avatar ou capa adultos separados.
- Nao ha moderacao automatica de avatar/banner.
- Perfis gerais veem a aba exclusiva vazia ou com posts pagos nao adultos, caso existam.

## Teste manual de seguranca

1. Abrir `/u/[username]` deslogado.
2. Inspecionar a aba Network do DevTools.
3. Confirmar que `/api/creator-profile/[username]/posts` nao contem texto adulto, texto pago, URLs protegidas ou chaves de midia.
4. Logar com usuario sem 18+.
5. Abrir a aba `Exclusivo`.
6. Confirmar que post pago seguro aparece somente com preco e metadados seguros.
7. Procurar no corpo da resposta pelo texto secreto do post pago.
8. Confirmar que ele nao existe.
9. Confirmar ausencia de `image_url`, `video_url` e itens `media` no card pago bloqueado.
10. Repetir com post adulto desbloqueado financeiramente, mas sem autorizacao adulta.
11. Confirmar que o conteudo adulto continua ausente.
12. Repetir com usuario plenamente autorizado e comprador/desbloqueado.

## Proximos pacotes sugeridos

- RPC server-side para listar posts publicos e exclusivos com contrato de payload minimo.
- Configuracao de visibilidade da aba exclusiva por perfil.
- Avatar/capa 18+ separados e revisados.
- Smoke E2E com fixtures locais para a rota `/u/[username]`.

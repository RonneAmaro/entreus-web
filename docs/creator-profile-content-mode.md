# Modo de conteudo do perfil do criador

Este pacote adiciona `profile_content_mode` em `public.profiles` para o criador informar como pretende usar uma unica identidade no EntreUS.

Valores:

- `general`: rotina, comunidades, conteudo comum e publicacoes premium nao adultas.
- `adult`: atividade principal inclui conteudo 18+ protegido.
- `mixed`: rotina e bastidores publicos, com conteudo adulto em area exclusiva protegida.

## Modo do perfil vs classificacao do post

O modo do perfil nao classifica posts. Ele nao libera conteudo adulto, nao ativa `wants_18_plus`, nao aprova verificacao de idade e nao transforma posts seguros em adultos.

A seguranca continua dependendo de cada publicacao:

- `community_type`;
- `content_rating`;
- categorias adultas legadas;
- idade e verificacao 18+;
- opt-in adulto;
- visibilidade;
- moderacao;
- desbloqueio pago.

## Interface

A configuracao fica em `/settings`, na secao `Tipo de conteudo do perfil`. A tela mostra as opcoes `Perfil geral`, `Perfil adulto` e `Perfil misto`.

Ao escolher `adult` ou `mixed`, a interface exibe aviso sobre avatar, capa, nome e biografia serem publicos e exige confirmacao antes de salvar. Esta confirmacao e apenas de interface neste pacote; a rota server-side ainda valida valor e identidade.

## Salvamento seguro

A atualizacao usa `app/api/profile/content-mode/route.ts`.

A rota:

- exige autenticacao;
- obtem identidade via `supabase.auth.getUser()`;
- aceita apenas `general`, `adult` ou `mixed`;
- atualiza somente `profiles.id = user.id`;
- preserva RLS usando anon key e Authorization do usuario;
- nao aceita `userId` do cliente;
- responde com headers privados e `no-store`;
- declara `dynamic = 'force-dynamic'`, `revalidate = 0` e `fetchCache = 'force-no-store'`.

## Fallback sem migration

Enquanto a migration nao for aplicada, leituras que falharem por ausencia de `profile_content_mode` caem para uma consulta sem a coluna e assumem `general`.

Se a rota de salvamento detectar a coluna ausente, retorna erro generico indicando que a migration precisa ser aplicada. A pagina nao quebra e o Composer continua seguro por padrao.

## Composer

O Composer permanece com `communityType = general` e `contentRating = safe` por padrao.

Para `adult`, ele apenas lembra que o perfil esta configurado como adulto e que a publicacao deve ser marcada como 18+ manualmente quando necessario.

Para `mixed`, ele lembra o criador de confirmar se a publicacao e publica ou 18+ antes de publicar.

## Avatar e capa

Avatar, capa, nome e biografia continuam publicos e devem ser adequados para visualizacao geral. Este pacote nao cria segundo avatar, segunda capa, IA de moderacao ou analise automatica de nudez.

## Migration

Migration criada para revisao manual:

`supabase/migrations/20260711_add_profile_content_mode.sql`

Ela adiciona a coluna, constraint e comentario. A migration nao foi aplicada automaticamente.

## Limitacoes e proximos passos

- Nao ha moderacao automatica de avatar/banner.
- Nao ha perfil adulto separado.
- Nao ha segundo username.
- Um pacote futuro pode usar o modo para orientar moderacao e revisoes de midia publica.

## Teste manual sugerido

1. Abrir `/settings` com perfil existente.
2. Confirmar fallback `Perfil geral`.
3. Selecionar `Perfil adulto`.
4. Confirmar que aparece o aviso.
5. Tentar salvar sem confirmacao.
6. Confirmar bloqueio.
7. Confirmar e salvar.
8. Reabrir a pagina.
9. Confirmar persistencia.
10. Abrir o Composer.
11. Confirmar que um post novo continua seguro por padrao.
12. Marcar manualmente um post como 18+.
13. Confirmar que somente esse post recebe classificacao adulta.
14. Alterar para `Perfil misto`.
15. Confirmar que posts antigos nao foram modificados.
16. Verificar que avatar e capa continuam publicos e seguros.

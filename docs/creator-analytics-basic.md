# Analytics basico de posts e criadores

Pacote 39 prepara contagem basica de visualizacoes autorizadas para posts.

## Banco de dados

A migration nova esta em:

`supabase/migrations/20260626_create_post_analytics.sql`

Ela deve ser revisada e aplicada manualmente no Supabase. O Codex nao aplicou a migration automaticamente.

A migration adiciona:

- tabela `public.post_views`;
- RLS para que apenas o criador do post ou admin leia as views;
- RPC `public.record_post_view(p_post_id uuid, p_source text)` com `SECURITY DEFINER`;
- deduplicacao diaria por `post_id`, `viewer_id` e `viewed_date`.

## Registro de view

O client registra view somente em `/post/[id]`, depois que a pagina ja confirmou:

- post existe e nao esta bloqueado para aquele usuario;
- conteudo adulto passou pela regra 18+ antes do paywall;
- post privado/followers respeita permissao de visualizacao;
- post pago so conta para autor, admin ou comprador com desbloqueio.

O MVP registra apenas views autenticadas. A tabela possui `viewer_key` para evoluir anonimos depois, mas este pacote nao grava hash anonimo nem IP bruto.

## Dashboard

`/creator-dashboard` le somente `post_id` e `created_at` de `post_views`.

O painel mostra:

- visualizacoes totais;
- views nos ultimos 7 dias;
- views nos ultimos 30 dias;
- engajamento estimado com base em interacoes / views;
- posts com mais views;
- taxa de engajamento por post.

Se a migration ainda nao estiver aplicada, o dashboard continua abrindo e mostra analytics de views como indisponivel.

## Seguranca

Nao ha insert direto liberado para `authenticated` em `post_views`; o registro passa pela RPC.

A RPC:

- usa `auth.uid()`;
- nao aceita usuario anonimo neste MVP;
- nao conta view bloqueada;
- valida `moderation_status`;
- valida adulto antes de paid post;
- valida `visibility = private` e `visibility = followers`;
- valida `paid_post_unlocks` para post pago;
- nao retorna conteudo, midia, link externo nem URL assinada.

## Teste manual

1. Aplicar manualmente a migration no Supabase.
2. Entrar com um criador e publicar um post publico.
3. Abrir `/post/<id>` logado como outro usuario.
4. Conferir em `/creator-dashboard` do criador:
   - `Visualizacoes` aumentou;
   - `Views 7 dias` e `Views 30 dias` refletem a view;
   - o post aparece em `Top por views`.
5. Abrir o mesmo post novamente no mesmo dia com o mesmo usuario: deve deduplicar.
6. Testar post pago travado: nao deve contar antes do desbloqueio.
7. Desbloquear o post pago e abrir novamente: a view pode ser contada.
8. Testar post adulto com usuario sem 18+ aprovado: nao deve contar.

## Limites

- Views anonimas nao sao contadas neste pacote.
- O registro acontece apenas na pagina individual do post, nao no scroll do feed.
- Rankings por post usam as ultimas linhas consultadas no dashboard; em volume alto, uma RPC agregada dedicada pode substituir a leitura direta agregada no client.

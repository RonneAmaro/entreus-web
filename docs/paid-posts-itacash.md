# Posts pagos com ItaCash

Pacote 38 prepara posts pagos/desbloqueaveis usando ItaCash.

## Banco de dados

A migration nova esta em:

`supabase/migrations/20260625_create_paid_post_unlocks.sql`

Ela deve ser revisada e aplicada manualmente no Supabase. O Codex nao aplicou a migration automaticamente.

A migration adiciona:

- `posts.is_paid`
- `posts.price_itacash`
- `paid_post_unlocks`
- RPC `public.unlock_paid_post(p_post_id uuid)` com `SECURITY DEFINER`
- RLS de leitura de `post_media` respeitando conteudo adulto e desbloqueio pago
- tipos de transacao `paid_post_unlock` e `paid_post_received`
- notificacao `paid_post_unlocked`

## Fluxo

1. O criador marca "Post pago" no compositor e informa um preco inteiro positivo em ItaCash.
2. Midias de posts pagos seguros usam `access_level = protected` e nao recebem URL publica.
3. Midias adultas continuam usando `adult_private`; se o post adulto tambem for pago, a validacao 18+ vem antes do paywall.
4. O comprador chama `/api/paid-posts/unlock`.
5. A rota chama a RPC `unlock_paid_post`, que valida autenticacao, permissao de visualizacao, saldo, nao-self-unlock e faz debito/credito de forma transacional.
6. O conteudo e as midias so renderizam quando o usuario e autor, admin, ou possui unlock.

## Teste manual

1. Aplicar a migration manualmente no Supabase.
2. Entrar com um criador e publicar um post pago com texto e imagem.
3. Entrar com outro usuario sem saldo e tentar desbloquear: deve mostrar saldo insuficiente e link para comprar ItaCash.
4. Creditar ItaCash ao usuario de teste e desbloquear novamente.
5. Confirmar que o post passa a mostrar conteudo/midia.
6. Conferir `/wallet` nos dois usuarios:
   - comprador: `Desbloqueio de post`
   - criador: `Post pago recebido`
7. Conferir `/creator-dashboard` no criador para ver total liquido e desbloqueios por posts pagos.

O split 85/15 do Pacote 40 esta documentado em `docs/itacash-revenue-split.md`.

## Limitacoes

- Sem a migration aplicada, a interface continua carregando posts antigos, mas criar post pago mostra que a migration precisa ser aplicada.
- Posts pagos travados sao sanitizados antes de entrar no estado/renderizacao do client: texto, URLs legadas e midias ficam nulos/vazios ate o desbloqueio.
- Risco residual: as paginas atuais ainda fazem consultas client-side ao Supabase para posts. A sanitizacao evita renderizacao/estado local, mas a resposta bruta da consulta pode conter `content` antes do filtro client-side. Para eliminar esse risco por completo, o proximo passo deve ser mover feeds/perfis/salvos para uma RPC/view server-side que ja retorne posts pagos travados sem `content`, `image_url` e `video_url`.
- A aba de midias de perfil publico mostra apenas midias com URL publica. Midias pagas protegidas aparecem no card/post apos desbloqueio.
- Saques continuam fora deste pacote.

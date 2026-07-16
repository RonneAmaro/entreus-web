# Sistema unificado de expressões

## Auditoria e arquitetura

As superfícies atuais são `PostComposer`, comentários em `app/feed/page.tsx`, conversa privada em `app/messages/[id]/page.tsx` e chat persistente/realtime do Meet. Havia três catálogos manuais de emoji e entrada de URL de GIF no Feed. Posts usam `posts`/`post_media`; comentários, `comments`/`comment_media`; mensagens, `messages`/`message_attachments`; Meet, API autenticada e `meet_room_chat_messages`. Upload, moderação, denúncia e RLS existentes permanecem vinculados ao registro pai.

`comment_media`, `post_media` e `message_attachments` foram desenhadas para uploads e não guardam provider, providerId, rating, alt e atribuição. A migration incremental `20260716_add_unified_expression_attachments.sql` adiciona `expression jsonb` às quatro tabelas-pai, com constraint para Tenor, rating `g`, CDN explícita e sem payload bruto. Ela não foi aplicada. As RLS das tabelas-pai continuam sendo a autorização; nenhuma permissão pública foi criada.

`ExpressionPicker` é o seletor único; `ExpressionAttachment`, o renderer único; `lib/expressions` contém tipo canônico, inserção no cursor, validação, provider, busca, rating e storage. `/api/expressions/search` e `/trending` autenticam, validam, limitam rajadas, impõem timeout e retornam somente o modelo mínimo. Emojis são Unicode. GIF/sticker é um único anexo estruturado, nunca HTML ou URL digitada. O contexto `reply` já existe para o Pacote 52, sem árvore neste pacote.

## Provedor, termos e configuração

Tenor foi escolhido. Em julho de 2026 sua documentação oficial oferece busca/featured, `searchfilter=sticker`, previews pequenos, paginação, `contentfilter`, cache sob `Cache-Control` e atualização diária, atribuição obrigatória e limite inicial de 1 RPS. Os termos admitem aplicações comerciais sob restrições e proíbem conteúdo sexual explícito. A integração usa filtro `high`, preserva ordem e mostra “Conteúdo por Tenor”. [Quickstart](https://developers.google.com/tenor/guides/quickstart), [endpoints](https://developers.google.com/tenor/guides/endpoints), [filtro](https://developers.google.com/tenor/guides/content-filtering), [limites/cache](https://developers.google.com/tenor/guides/rate-limits-and-caching) e [termos](https://developers.google.com/tenor/guides/api-terms).

GIPHY não foi escolhido: sua [documentação atual](https://developers.giphy.com/docs/api/) exige busca client-side, incompatível com a chave exclusivamente server-side deste pacote.

Configuração exclusivamente no servidor (não adicionada a `.env.local`):

```text
EXPRESSIONS_ENABLED=true
EXPRESSIONS_PROVIDER=tenor
EXPRESSIONS_API_KEY=<chave restrita à API Tenor>
```

Sem configuração, GIF/sticker falham controladamente e emojis funcionam. A chave só segue para `tenor.googleapis.com`; nunca resposta, log ou storage.

## Segurança, conteúdo e privacidade

A API aceita `gif|sticker`, busca até 80 caracteres, lote até 24, cursor numérico, debounce de 320 ms, timeout de 4,5 s e rate limit best-effort de 30/min por usuário. O endpoint fixo impede SSRF. Rating, host, SVG, HTML e resposta malformada são rejeitados. Buscas não são logadas. Para múltiplas instâncias, trocar o Map por limitador distribuído.

Não há proxy/cache. O browser acessa `media.tenor.com`, expondo IP e metadados de rede ao CDN; revisar a política de privacidade antes da ativação. `next.config.ts` não possuía CSP/remotePatterns. Uma CSP futura deve liberar somente `media.tenor.com` em `img-src`/`media-src`, nunca wildcard. Não criar proxy sem revisão contratual.

## UX, acessibilidade e armazenamento

Desktop usa painel ancorado; mobile, sheet de até 88dvh. Tabs têm roles/seleção, controles têm nomes e 44 px, foco visível, Escape fecha e restaura foco. Mídia usa alt, dimensões, lazy loading, fallback e preview estático sob redução de movimento. Recentes (30) e favoritos (50) ficam em `entreus:expressions:v1`, separados por userId/tipo. localStorage indisponível não quebra. Troca/logout deixa de ler o namespace anterior.

Posts, comentários, mensagens e Meet compartilham seletor/modelo/renderer. Texto puro e mensagens antigas continuam válidos; expressão sem texto é permitida. Meet mantém LiveKit, gravação e data channel. Edição de expressão, upload de stickers, pacotes próprios/VIP, favoritos no banco e galeria adulta ficam fora do escopo. A migration deve ser revisada e aplicada em staging antes de persistência real.

## Performance, testes e rollback

O picker só monta aberto, busca 18 itens, pagina e usa thumbnails lazy; nenhuma dependência foi adicionada. Unitários cobrem cursor, Unicode, validação, allowlist, rating, busca, storage, sanitização e segredo. E2E deve mockar API, Supabase e fornecedor, sem conta/chave real.

Rollback: remover componentes/rotas/lib e não aplicar a migration. Se aplicada, interromper gravações, verificar/exportar valores e remover constraints/colunas/função em migration nova. Nunca editar migration aplicada. Storage local pode ser removido pelo prefixo `entreus:expressions:v1`.

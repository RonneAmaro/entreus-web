# Pacote 52 — Feed premium e comentários encadeados

## Auditoria inicial

O Feed principal está em `app/feed/page.tsx`. Ele reúne carregamento, composer, cards,
ações, comentários e trilhos laterais em um único client component. Posts já usam
cursor estável `(created_at, id)`, com 24 itens iniciais e 12 adicionais. Os cards
principais são renderizados na própria página; `PostCard` é reutilizado em outras
rotas. Há diferimento por viewport, skeleton inicial, retry do carregamento adicional
e proteção de posts por visibilidade, classificação, bloqueio, moderação e conteúdo
pago.

Antes deste pacote, comentários eram uma lista plana, crescente por data, limitada
globalmente a 160 registros para todos os posts carregados. Criação, edição e
exclusão eram mutações diretas do browser em `comments`; `user_id` e `post_id`
vinham do cliente. A exclusão era física. Comentários aceitavam texto, mídia e a
expressão validada do Pacote 51. Likes de comentários eram carregados em lote, mas
não existiam respostas, contagem de filhos ou paginação por post. O botão
“Responder” abria um composer para um novo comentário raiz.

As permissões existentes são RLS: a migration
`20260621_harden_adult_content_rls.sql` permite leitura apenas quando o post é
visível e restringe insert/update/delete ao autor ou administrador. Notificações
de comentário eram inseridas pelo cliente, sem idempotência. Não foi encontrada
subscription realtime do Feed nem rate limit de comentários. Denúncia existe para
posts; não havia fluxo de denúncia específico de comentário.

## Arquitetura implementada

`parent_comment_id = NULL` representa uma raiz. Respostas têm FK autorreferenciada,
`depth` derivado pelo banco e o mesmo `post_id` do pai. São seis níveis lógicos
(0–5) e três níveis visuais. Depois disso, a UI mantém linha e indicação de contexto
sem continuar comprimindo o conteúdo.

`ThreadedComments` carrega dez raízes por post e três filhos diretos por nó. Cada
grupo usa cursor composto por data e UUID, ordenação determinística e paginação
independente. As respostas só são buscadas ao expandir. A contagem `reply_count`
é mantida no mesmo transaction boundary por trigger e a migration inclui uma
reconstrução idempotente, evitando N+1.

As RPCs são:

- `create_threaded_comment`: deriva `auth.uid()`, valida post, pai, visibilidade,
  profundidade, conteúdo, expressão, rate limit e idempotência;
- `edit_threaded_comment`: preserva pai/post/autor, revalida conteúdo e impede
  edição após remoção;
- `delete_threaded_comment`: apaga fisicamente folhas e transforma nós com filhos
  em “Comentário removido”, removendo texto, expressão e mídias;
- consultas paginadas continuam em `comments`, sob a RLS existente.

O trigger de integridade também protege inserts/updates que não passem pela RPC:
autor, post, pai e profundidade não podem ser manipulados. A FK usa `ON DELETE
RESTRICT`, portanto uma conversa não é destruída em cascata.

## Notificações, moderação e realtime

Respostas notificam apenas o autor direto do pai e comentários raiz notificam o
autor do post. Auto-notificações são ignoradas. O índice parcial e o
`client_request_id` tornam retries idempotentes. O tipo existente `comment` foi
reutilizado para não reescrever a constraint global de tipos; `comment_id` aponta
para a nova resposta.

Administradores continuam autorizados por `is_admin()`. Remoção administrativa
preserva filhos. A UI deste pacote expõe editar/excluir ao autor; a infraestrutura
de denúncias foi ampliada de forma incremental: `report_threaded_comment` valida
autenticação, existência e relação comentário/post, acesso ao post, motivo entre
10 e 500 caracteres, limite de cinco denúncias de comentários por dia e
idempotência. A tabela `reports` recebe somente IDs, profundidade e o tipo canônico
da expressão; texto do comentário, URLs e payload do Tenor não são copiados. A fila
administrativa mostra esse contexto mínimo e remove o nó pela mesma RPC segura,
sem apagar respostas legítimas.

Não foi adicionada subscription realtime. Depois de uma mutação local, somente o
nó afetado é recarregado e as contagens são sincronizadas. Eventos remotos aparecem
no próximo refresh/expansão. Isso evita subscriptions por árvore e mantém RLS como
fonte de autorização.

## Expressões

O composer de resposta reutiliza `ExpressionPicker` com `context="reply"`.
Emoji vira Unicode no texto; GIF e sticker usam o objeto canônico do Pacote 51 e
podem ser enviados sem texto. A RPC chama `is_valid_expression_asset`, repetindo a
validação no servidor. `ExpressionAttachment` preserva texto alternativo e lazy
loading.

## UX, acessibilidade e responsividade

O Feed mantém o design system existente e substitui caixas planas por uma conversa
com hierarquia leve, superfícies únicas, linha de continuidade e ações compactas.
Expandir/recolher usa `aria-expanded` e `aria-controls`; cada item informa o nível;
conteúdo removido tem nome acessível; Escape e restauração de foco são herdados do
picker; composers usam labels e erros com `role=alert`. Áreas interativas têm ao
menos 40–44 px.

No mobile, o composer abre junto ao comentário, o picker usa seu bottom sheet de
`88dvh` e a margem visual para de crescer após 24 px. O Feed já bloqueia overflow
horizontal. Desktop/tablet preservam a coluna principal e o popover fica ancorado
ao nó.

## Segurança e performance

O cliente não envia autor ou profundidade. A RPC confere autenticação, post/pai,
mesmo post, visibilidade, remoção do pai, limite de profundidade e no máximo 12
comentários por minuto. A constraint do Pacote 51 rejeita URLs/payloads de
expressão não canônicos. Não há HTML externo, `dangerouslySetInnerHTML`, grant
público novo ou logs de conteúdo.

As consultas caem de até 160 comentários globais mais a árvore completa para dez
raízes e três filhos sob demanda. Não há query de contagem por comentário,
subscription ilimitada nem refresh integral após uma resposta. GIFs e avatares
usam lazy loading. O impacto de bundle é um componente client reutilizando
dependências já existentes; nenhuma dependência foi adicionada.

## Migrations, rollout e rollback

Ordem manual obrigatória:

1. `20260716_add_unified_expression_attachments.sql` (Pacote 51);
2. `20260717_add_threaded_comments_and_premium_feed.sql` (Pacote 52).

Nenhuma migration foi aplicada por este trabalho. Antes do rollout, executar os
testes estruturais em banco descartável e confirmar os nomes/constraints do banco
real. Para rollback: remover primeiro as quatro RPCs, triggers e índices do Pacote 52;
manter `parent_comment_id`, `depth`, `reply_count` e marcadores de exclusão até
exportar/reconciliar respostas. Não remover a FK nem colunas enquanto existirem
filhos. O frontend anterior pode continuar lendo comentários antigos, pois raízes
legadas permanecem com pai nulo.

## Testes e limitações

Unitários cobrem cursores, ordem, deduplicação, conteúdo texto/emoji/expressão,
profundidade visual e estrutura SQL (FK, índices, ciclos, pai cruzado, imutabilidade,
profundidade, autor, RLS, contagem, exclusão, autorização, rate limit e
notificações). O build cobre TypeScript e renderização das rotas.

Em 17/07/2026, o E2E dedicado `threaded-comments.spec.ts` passou com 8/8 cenários
usando sessão, REST, RPC, WebSocket e mídia totalmente simulados. Nenhuma chamada
real a Supabase, Tenor ou R2 foi permitida. Foram revisadas sete capturas em
`reports/threaded-comments/`: desktop claro/escuro, tablet escuro, mobile
claro/escuro, comentário removido com filhos e resposta com expressão. Não foi
observado overflow horizontal. As imagens são artefatos locais e não devem entrar
no commit.

A suíte integral foi repetida em servidor externo controlado na porta 3001, com um
worker. Ela não terminou no limite de 15 minutos: 37 testes passaram; o
`dark theme audit on desktop` falhou após acumular hydration mismatches em rotas
anteriores (`caret-color: transparent` inserido durante capturas Playwright); o
`dark theme audit on mobile` passou; 14 testes não chegaram a executar. O E2E
dedicado do Pacote 52 permaneceu verde isoladamente. A falha foi classificada como
infraestrutura/teste visual preexistente, não como regressão dos comentários.

Não foi possível executar as migrations em PostgreSQL descartável: este host não
possui Docker, `psql` ou Supabase CLI. A migration foi reauditada estruturalmente,
mas isso não substitui execução real. O roadmap permanece pendente por esse motivo.

Limitações atuais:

- sem realtime remoto;
- validação SQL real aguarda um host com PostgreSQL/Docker/Supabase CLI;
- bloqueios entre usuários dependem da visibilidade/RLS já existente e devem ser
  reforçados numa função central do banco quando esse schema for consolidado;
- rate limit é transacional por janela, mas não substitui proteção de borda;
- os E2E legados usam mocks genéricos e precisam de fixtures RPC específicas para
  cobrir toda a matriz de resposta/edição/exclusão.

O Pacote 52 só deve ser marcado concluído no roadmap depois da validação das duas
migrations em banco descartável. A matriz visual específica já cobre 390×844,
360×800, 1440×900 e 768×1024.

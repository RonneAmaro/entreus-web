# Auditoria Supabase Storage -> Cloudflare R2

Data: 2026-06-10

Escopo: auditoria tecnica somente leitura para localizar uso de Supabase Storage/CDN e campos de banco que guardam midias. Nenhum arquivo foi migrado, nenhum dado foi atualizado, nenhuma migration foi criada.

## Resumo executivo

O fluxo principal de novos uploads do feed ja usa Cloudflare R2 para posts e comentarios por meio de `/api/r2/presign`. O endpoint legado `/api/r2/upload` esta desativado com status 410.

Ainda ha uso direto de Supabase Storage em pontos relevantes:

- Perfil: avatares em `avatars` e banners em `profile-banners`.
- Editor de video: publica video renderizado no bucket Supabase `posts`.
- Mensagens privadas: anexos no bucket privado `message-media`.
- Meet: anexos no bucket privado `meet-chat-attachments`.
- Verificacao de idade e consentimento parental: documentos/selfies no bucket privado `age-verifications`.

O maior risco de Cached Egress vem das midias publicas servidas por URL publica do Supabase: posts antigos, videos do editor, avatares e banners. Anexos privados geram egress quando acessados por signed URL, mas tendem a ter menor volume e exigem regras de privacidade mais fortes.

## Mapa de uso no codigo

| Arquivo | Linha aprox. | Funcionalidade | Bucket/tipo | Campo de banco | Provedor atual | Risco Cached Egress | Recomendacao |
|---|---:|---|---|---|---|---|---|
| `app/feed/page.tsx` | 1980, 2060, 2128 | Upload de midia de post via presign + PUT | R2 `posts/` | `posts.image_url`, `posts.video_url`, `post_media.media_url` | R2 para novos uploads | Baixo para novos uploads; alto para registros antigos se URL ainda apontar para Supabase | Manter R2; migrar historico de `posts`/`post_media` que contenha Supabase Storage URL |
| `app/feed/page.tsx` | 2213, 2288, 2342 | Upload de midia de comentario via presign + PUT | R2 `comments/` | `comment_media.media_url` | R2 para novos uploads | Baixo para novos uploads; medio/alto para historico antigo | Manter R2; auditar/migrar `comment_media.media_url` legado |
| `app/api/r2/presign/route.ts` | 18, 64, 297, 318 | Gera URL assinada de upload R2 | R2 `posts/`, `comments/` | Retorna `publicUrl` e `key` | R2 | Baixo | Fluxo correto para midias publicas novas; futuramente persistir `r2_key/provider` |
| `app/api/r2/upload/route.ts` | 6, 10 | Endpoint legado de upload | N/A | N/A | Desativado/410 | Baixo | Manter 410; remover clientes antigos depois da auditoria de trafego |
| `app/profile/page.tsx` | 726-743 | Upload de avatar e `getPublicUrl` | Supabase `avatars` publico | `profiles.avatar_url` | Supabase Storage | Alto: avatar aparece em feed, mensagens, busca, admins etc. | Migrar para R2 e trocar upload de perfil para presign/pasta `avatars/` |
| `app/profile/page.tsx` | 775-792 | Upload de banner e `getPublicUrl` | Supabase `profile-banners` publico | `profiles.banner_url` | Supabase Storage | Alto em paginas publicas de perfil | Migrar para R2 e trocar upload para presign/pasta `banners/` |
| `app/components/VideoEditor.tsx` | 3240-3259 | Publica video renderizado no feed | Supabase `posts`, caminho `videos/...mp4` | `posts.video_url` | Supabase Storage | Muito alto: video publico e pesado | Prioridade alta: trocar para R2 ou reutilizar `/api/r2/presign` com `folder: posts` |
| `app/components/PostCard.tsx` | 135-151, 213-225 | Renderiza midia do post, com fallback legado | URLs de `posts`/`post_media` | `posts.image_url`, `posts.video_url`, `post_media.media_url` | Leitura de URL armazenada | Depende da URL; alto se Supabase | Nao precisa mudar para migracao inicial; validar URLs apos script |
| `app/components/PostMediaGallery.tsx` | 224, 240, 468, 477 | Renderiza galeria de midias | URLs de `post_media.media_url` | `post_media.media_url` | Leitura de URL armazenada | Depende da URL; alto se Supabase | Nao precisa mudar; migrar valores no banco em fase A |
| `app/post/[id]/page.tsx` | 161-182, 252 | Carrega post individual e `post_media` | URLs de posts | `posts.image_url`, `posts.video_url`, `post_media.media_url` | Leitura de URL armazenada | Depende da URL | Incluir nas validacoes pos-migracao |
| `app/u/[username]/page.tsx` | 202, 734, 1887-1932, 2336 | Perfil publico, banner/avatar e midias de posts | URLs de perfil/posts | `profiles.avatar_url`, `profiles.banner_url`, `post_media.media_url`, `posts.*_url` | Leitura de URL armazenada | Alto se Supabase | Incluir em teste visual apos fases A/B |
| `app/messages/[id]/page.tsx` | 1714-1725 | Cria signed URL para anexos de mensagem | Supabase `message-media` privado | `message_attachments.storage_path` | Supabase Storage | Medio: privado, mas pode ter imagem/video/audio | Migrar depois de publico; exige fluxo privado em R2 ou signed URLs server-side |
| `app/messages/[id]/page.tsx` | 2860-2877 | Upload de anexos de mensagens | Supabase `message-media` privado | `message_attachments.storage_path` | Supabase Storage | Medio/alto se anexos forem frequentes | Fase C; criar API server-side para presign privado e campos `provider/key` |
| `app/messages/[id]/page.tsx` | 2783-2785 | Remove anexo do Supabase Storage | Supabase `message-media` | `message_attachments.storage_path` | Supabase Storage | N/A para egress; relevante para consistencia | Nao migrar deletions ate definir politica de retencao no R2 |
| `app/api/meet/rooms/[roomName]/messages/attachments/route.ts` | 195-218 | Upload de anexo do Meet | Supabase `meet-chat-attachments` privado | `meet_room_chat_messages.attachment_path` | Supabase Storage | Medio: privado, TTL esperado de 24h | Fase C; pode permanecer privado enquanto prioridade for Cached Egress publico |
| `app/api/meet/rooms/[roomName]/messages/attachments/download/route.ts` | 88-98 | Gera signed URL de download do Meet | Supabase `meet-chat-attachments` privado | `meet_room_chat_messages.attachment_path` | Supabase Storage | Medio | Migrar com endpoint que assina GET no R2 e preserva autorizacao de sala |
| `app/api/admin/meet/attachments/audit/route.ts` | 61-77 | Auditoria de anexos Meet | Nao acessa Storage; conta linhas | `meet_room_chat_messages` | Banco apenas | Baixo | Manter; estender no futuro para provider/key sem gerar signed URLs |
| `app/age-verification/page.tsx` | 167-178, 260-267 | Upload de documentos 18+ | Supabase `age-verifications` privado | `age_verification_requests.document_front_path`, `document_back_path`, `selfie_path` | Supabase Storage | Baixo/medio em volume; alto em sensibilidade | Nao misturar com migracao publica; manter privado e revisar compliance antes de R2 |
| `app/api/admin/age-verifications/signed-url/route.ts` | 95-116 | Signed URL admin para documentos 18+ | Supabase `age-verifications` privado | `age_verification_requests.*_path` | Supabase Storage | Baixo/medio; acesso admin | Fase D separada; usar URLs curtas e auditoria |
| `app/api/parental-consent/respond/route.ts` | 433-455 | Upload de selfie de responsavel | Supabase `age-verifications` privado | `parental_consent_requests.guardian_selfie_path` | Supabase Storage | Baixo/medio; sensivel | Fora da migracao publica; tratar junto com Fase D se houver necessidade |

Observacao: tambem ha uso de Supabase Storage em comprovantes de pagamento (`payment-proofs`). Essa area foi apenas identificada por busca automatica e nao foi analisada em profundidade porque pagamentos/ItaCash estavam fora do escopo operacional deste pacote.

## Campos de banco com URLs ou caminhos de midia

Campos publicos ou semi-publicos com maior potencial de Cached Egress:

- `profiles.avatar_url`: URL publica do avatar; hoje pode receber URL de `avatars`.
- `profiles.banner_url`: URL publica da capa; hoje pode receber URL de `profile-banners`.
- `posts.image_url`: URL publica legada/primeira midia do post.
- `posts.video_url`: URL publica legada/primeiro video do post.
- `post_media.media_url`: URL publica de midias multipla de posts.
- `comment_media.media_url`: URL publica de midias em comentarios.
- `digital_gifts.media_url`: URL ou caminho de midia de presentes; seeds indicam uso local `/gifts/videos/%`, nao foco da migracao R2.
- `community_challenges.banner_url`: URL de banner de desafio; nao ha upload encontrado no escopo, mas o campo pode guardar URL externa/Supabase.

Campos privados que guardam caminhos de Storage:

- `message_attachments.storage_path`: caminho no bucket `message-media`.
- `meet_room_chat_messages.attachment_path`: caminho no bucket `meet-chat-attachments`.
- `age_verification_requests.document_front_path`: caminho no bucket `age-verifications`.
- `age_verification_requests.document_back_path`: caminho no bucket `age-verifications`.
- `age_verification_requests.selfie_path`: caminho no bucket `age-verifications`.
- `parental_consent_requests.guardian_selfie_path`: caminho no bucket `age-verifications`.

Campos sensiveis fora do plano de midia publica:

- `itacash_purchase_requests.proof_path`: caminho no bucket `payment-proofs`; fora do escopo deste pacote por envolver pagamentos/ItaCash.

## Confirmacao de novos uploads

- Posts e comentarios no feed: usam R2 por `/api/r2/presign` e PUT direto para `uploadUrl`; armazenam `publicUrl` em `posts.image_url`, `posts.video_url`, `post_media.media_url` e `comment_media.media_url`.
- `/api/r2/presign`: aceita somente pastas `posts` e `comments`, valida usuario Supabase, content-type, tamanho e rate limit simples.
- `/api/r2/upload`: legado e desativado com `LEGACY_UPLOAD_DISABLED` e HTTP 410.
- Avatares/banners: ainda usam Supabase Storage direto em `app/profile/page.tsx`.
- Editor de video: ainda usa Supabase Storage direto no bucket `posts`; esse ponto pode recriar URLs Supabase em `posts.video_url` mesmo depois da migracao do feed.
- Mensagens/Meet/verificacao: ainda usam Supabase Storage privado e signed URLs.

## Plano de migracao seguro

### Fase A: posts e post_media antigos

Tabelas/campos:

- `posts.image_url`
- `posts.video_url`
- `post_media.media_url`
- `comment_media.media_url` se houver URLs antigas de comentarios

Risco: alto impacto em Cached Egress porque sao midias publicas e acessadas no feed, perfil, post individual, salvos, desafios e admin/moderacao.

Precisa script: sim.

Precisa backup: sim, CSV/JSON por tabela com `id`, campo antigo, URL nova, key R2 e timestamp.

Pode ser feito sem migration: sim, substituindo URLs existentes por URLs publicas R2, desde que a aplicacao continue lendo URL absoluta.

Migration futura recomendada: sim, adicionar campos como `media_provider`, `r2_key`, `storage_bucket` ou tabela de assets para idempotencia e auditoria.

### Fase B: avatares e banners

Tabelas/campos:

- `profiles.avatar_url`
- `profiles.banner_url`

Risco: alto para Cached Egress por aparecerem em muitas telas; risco visual alto se URL quebrar.

Precisa script: sim, mas menor que posts.

Precisa backup: sim.

Pode ser feito sem migration: sim, trocando URL publica.

Migration futura recomendada: sim, `avatar_provider/avatar_key` e `banner_provider/banner_key`, ou uma tabela de media por uso.

Mudanca de codigo necessaria: trocar `app/profile/page.tsx` para upload R2, provavelmente estendendo `/api/r2/presign` para aceitar `avatars` e `banners`.

### Fase C: anexos de mensagens e Meet

Tabelas/campos:

- `message_attachments.storage_path`
- `meet_room_chat_messages.attachment_path`

Risco: medio. Nao sao publicos, mas podem conter arquivos maiores. O maior risco e quebrar autorizacao/privacidade se migrar apressado.

Precisa script: sim, com leitura privada Supabase e escrita privada R2.

Precisa backup: sim.

Pode ser feito sem migration: possivel, mas nao recomendado, porque os campos atuais guardam path sem provider.

Migration futura recomendada: sim, adicionar `storage_provider`, `storage_key`, `storage_bucket`, talvez `storage_migrated_at`.

Mudanca de codigo necessaria: endpoints server-side para upload/download em R2 com signed URLs curtas e validacao de conversa/sala.

### Fase D: arquivos sensiveis e verificacao 18+

Tabelas/campos:

- `age_verification_requests.document_front_path`
- `age_verification_requests.document_back_path`
- `age_verification_requests.selfie_path`
- `parental_consent_requests.guardian_selfie_path`

Risco: baixo/medio para egress, alto para privacidade/compliance.

Precisa script: somente se houver decisao explicita de migrar documentos sensiveis.

Precisa backup: sim, criptografado ou armazenado com controles fortes; evitar exportar URLs assinadas.

Pode ser feito sem migration: nao recomendado.

Migration futura recomendada: sim, campos de provider/key, metadados de retencao, trilha de auditoria e politica clara de delecao.

Recomendacao: nao priorizar para reduzir Cached Egress publico. Se migrar, usar R2 privado, signed URLs curtas e logs de acesso administrativos.

## Arquitetura sugerida para script futuro

Arquivo futuro sugerido: `scripts/migrate-supabase-storage-to-r2.ts`.

Comportamento recomendado:

- Rodar localmente, lendo `.env.local` sem imprimir secrets.
- `dry-run` por padrao.
- Receber `--phase posts|profiles|messages|meet|sensitive`.
- Consultar Supabase por lotes pequenos e listar URLs/caminhos encontrados.
- Filtrar somente URLs Supabase Storage quando a fase for publica.
- Baixar o objeto antigo pelo caminho ou URL existente.
- Subir para R2 com key deterministica, por exemplo `migrated/posts/{postId}/{field}-{hash}.{ext}`.
- Gerar CSV/JSON de backup antes de qualquer update.
- Atualizar Supabase apenas com flag explicita, por exemplo `--apply --confirm UPDATE_SUPABASE`.
- Ser idempotente: se a URL ja for R2 ou key ja existir, pular ou validar checksum/tamanho.
- Nunca apagar arquivo antigo automaticamente.
- Nunca imprimir tokens, signed URLs longas ou secrets.
- Registrar totais: encontrados, pulados, migrados, falhas, bytes estimados.

SQL de descoberta futuro, sem atualizar dados:

```sql
select id, image_url, video_url
from public.posts
where image_url ilike '%supabase.co/storage%'
   or video_url ilike '%supabase.co/storage%';

select id, post_id, media_url
from public.post_media
where media_url ilike '%supabase.co/storage%';

select id, comment_id, media_url
from public.comment_media
where media_url ilike '%supabase.co/storage%';

select id, avatar_url, banner_url
from public.profiles
where avatar_url ilike '%supabase.co/storage%'
   or banner_url ilike '%supabase.co/storage%';
```

## Validacao recomendada depois da migracao

- Abrir feed, post individual, perfil publico, salvos, desafios e moderacao.
- Confirmar que URLs novas usam dominio publico do R2.
- Confirmar que o Supabase Storage/CDN nao recebe requisicoes para midias publicas migradas.
- Conferir logs do script e amostras de objetos no R2.
- Manter arquivos antigos no Supabase ate uma janela de observacao definida.

## Limitacoes desta auditoria

- Nao houve consulta ao banco de producao, portanto nao ha contagem real de registros Supabase Storage versus R2.
- Nao houve acesso ao dashboard Supabase/Cloudflare.
- Linhas sao aproximadas e podem mudar com edicoes posteriores.
- Areas de pagamentos/ItaCash foram evitadas conforme restricao; apenas aparicoes obvias foram anotadas como fora do escopo.
- Nenhum script de migracao foi criado neste pacote.

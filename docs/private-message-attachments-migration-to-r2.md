# Migracao de anexos privados de mensagens para R2

## Objetivo

Este pacote migra somente `private-message-attachments`, isto e, o campo
`message_attachments.storage_path`, do bucket privado Supabase
`message-media` para uma referencia privada no Cloudflare R2.

Ficam fora deste pacote:

- `sensitive-age-verification`
- `sensitive-payment-proofs`
- `public-posts`
- `public-profiles`
- `private-meet-attachments`
- pagamentos, LiveKit/Meet, 18+, consentimento parental e migrations SQL

## Privacidade

Anexos de mensagens privadas nao devem ser gravados como URL publica simples.
O banco passa a guardar uma key privada no formato:

```text
private/messages/{conversationId}/{messageId}/{attachmentId}/migrated-...
```

A UI nao acessa essa key diretamente. Ela chama:

```text
GET /api/messages/attachments/download?attachmentId=...
```

A rota valida o usuario autenticado e confirma que ele participa da conversa em
`conversation_participants` antes de gerar uma URL temporaria. Para anexos
legados ainda no Supabase, a mesma rota gera signed URL do bucket
`message-media`. Para anexos migrados, ela gera signed URL do R2 via S3 API.

Se a infraestrutura tiver bucket privado separado para anexos, use
`R2_MESSAGE_ATTACHMENTS_BUCKET_NAME` ou `R2_PRIVATE_BUCKET_NAME`. Sem essas
variaveis, o script usa `R2_BUCKET_NAME`, mas a aplicacao continua sem salvar
URL publica no banco.

## Dry-run

```powershell
npm.cmd run private-message-attachments:migrate:dry-run
```

O dry-run:

- le somente `message_attachments.storage_path`;
- classifica `supabase-storage`, `cloudflare-r2`, `external-url`,
  `local-public`, `empty/null` e `unknown`;
- nao baixa arquivos;
- nao envia arquivos;
- nao atualiza banco;
- nao apaga nada;
- grava `reports/private-message-attachments-migration-dry-run.json`;
- mascara paths e exemplos privados.

## Execute

```powershell
npm.cmd run private-message-attachments:migrate:execute
```

O execute:

- processa apenas candidatos `supabase-storage`;
- baixa o objeto original do Supabase Storage;
- envia para R2 em `private/messages/...`;
- pula upload se o objeto ja existir no R2;
- atualiza somente `message_attachments.storage_path`;
- confirma o update com leitura posterior;
- nao apaga a origem no Supabase Storage;
- nao apaga objetos no R2;
- grava `reports/private-message-attachments-migration-execute.json`.

## Validacao

Antes de executar:

```powershell
npm.cmd run build
npm.cmd run private-message-attachments:migrate:dry-run
node -e "const r=require('./reports/private-message-attachments-migration-dry-run.json'); console.log(JSON.stringify(r,null,2).slice(0,12000))"
```

Depois do execute:

```powershell
npm.cmd run media:migration:extended-dry-run
node -e "const r=require('./reports/media-migration-extended-dry-run.json'); console.log(JSON.stringify({totals:r.totals, byArea:r.totals?.byArea||r.byArea},null,2).slice(0,12000))"
npm.cmd run build
```

O resultado esperado e `private-message-attachments.supabase-storage = 0`.
Os restantes fora de escopo seguem em pacotes separados:
`sensitive-age-verification` e `sensitive-payment-proofs`.

# Migracao de midias publicas de posts para R2

## Objetivo

Este pacote migra apenas referencias publicas de posts que ainda apontam para Supabase Storage, copiando os arquivos para Cloudflare R2 e atualizando o campo correspondente no banco somente depois de confirmar o objeto no R2.

Fontes cobertas:

- `posts.image_url`
- `posts.video_url`
- `post_media.media_url`

Fora do escopo deste pacote:

- anexos de mensagens privadas;
- anexos de Meet;
- documentos de verificacao 18+;
- comprovantes/pagamentos;
- consentimento parental;
- perfis/avatar/banner;
- qualquer arquivo sensivel ou privado.

## Garantias

O script:

- nao edita `.env.local`;
- nao imprime secrets, service role key, R2 secret, tokens ou signed URLs;
- nao apaga arquivos no Supabase Storage;
- nao apaga objetos no R2;
- nao cria migration SQL;
- nao atualiza banco antes de confirmar R2;
- usa guarda pelo valor antigo no update;
- e idempotente para objetos ja existentes no R2 e campos ja migrados.

## Dry Run

```powershell
npm.cmd run public-post-media:migrate:dry-run
```

Relatorio:

- `reports/public-post-media-migration-dry-run.json`

O dry-run apenas le as fontes publicas de posts, classifica as referencias e lista os candidatos `supabase-storage`. Ele nao baixa, nao sobe, nao atualiza e nao apaga nada.

## Execute

Use somente depois de revisar o dry-run:

```powershell
npm.cmd run public-post-media:migrate:execute
```

Relatorio:

- `reports/public-post-media-migration-execute.json`

Para cada candidato, o script:

1. confirma que o campo ainda contem a URL original;
2. verifica se o objeto planejado ja existe no R2;
3. se nao existir, baixa o arquivo original do Supabase Storage;
4. envia para R2;
5. confirma o objeto no R2;
6. atualiza somente o campo correspondente;
7. confirma por leitura que o campo aponta para R2.

As chaves R2 usam prefixos dentro de `posts/`, compativeis com a auditoria R2 existente:

- `posts/images/{postId}/...`
- `posts/videos/{postId}/...`
- `posts/media/{postId}/...`

## Validacao

Depois do execute:

```powershell
npm.cmd run media:migration:extended-dry-run
```

O esperado para este pacote e:

- `public-posts` com `supabase-storage: 0`;
- total geral de `supabase-storage` reduzido em 41;
- candidatos privados/sensiveis ainda presentes para pacotes futuros.

O watchdog pode continuar `critical` depois deste pacote porque ainda devem existir referencias fora do escopo em anexos privados e areas sensiveis. Nao use `--test-email` durante esta validacao para evitar spam de alerta.

## Origem

A origem no Supabase Storage e preservada. Este pacote nao remove arquivos antigos; limpeza de origem deve ser planejada em pacote separado, com auditoria e janela propria.

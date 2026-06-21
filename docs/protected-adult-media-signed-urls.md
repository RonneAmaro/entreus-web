# Mídia adulta protegida e signed URLs

RLS protege metadata, não URLs públicas já emitidas. O presign R2 atual produz `publicUrl` e `key`, enquanto `post_media` versionado persiste `media_url`; não há coluna versionada para provider/bucket/key que permita uma rota GET assinada segura depois do upload.

`lib/media/protected-post-media.ts` é fail-closed: mídia adulta bloqueada não entrega URL, key, bucket ou path. Para usuário autorizado, ela exige uma signed URL em vez de reutilizar URL direta.

Etapa 39B: adicionar metadata de provider/bucket/key, guardar uploads adultos num prefixo/bucket privado, criar `GET /api/post-media/[mediaId]/signed-url` que consulta o post pai e `content-access`, migrar arquivos adultos antigos e remover URLs públicas. Não alteramos buckets, R2, arquivos ou uploads neste pacote.

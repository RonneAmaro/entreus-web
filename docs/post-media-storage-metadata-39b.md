# Metadata de storage — Pacote 39B

Aplicar manualmente `20260621_add_post_media_storage_metadata.sql`, verificar com `verify-post-media-storage-metadata.sql` e usar o rollback apenas para constraints/índices. As colunas preservam `media_url` legado e permitem que uploads futuros registrem provider, bucket, key e `access_level`.

Mídia adulta legada continua bloqueada pelo helper; não é migrada automaticamente. O plano dry-run `npm.cmd run plan:adult-media-protection` não toca banco ou storage. A rota GET signed URL e o upload privado só devem ser integrados depois da migration estar aplicada e o cliente passar metadata confiável do presign.

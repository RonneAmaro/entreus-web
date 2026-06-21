# Metadata de storage — Pacote 39B

A migration `20260621_add_post_media_storage_metadata.sql` deve ser aplicada manualmente antes do uso em produção. Ela preserva `media_url` legado e adiciona `storage_provider`, `storage_bucket`, `storage_key` e `access_level`. Use `verify-post-media-storage-metadata.sql` somente para leitura; o plano dry-run não toca banco nem storage.

## Continuação implementada no Pacote 39C

As colunas do 39B são usadas pelo fluxo privado real. `access_level = adult_private` sinaliza renderização protegida. `storage_provider`, `storage_bucket` e `storage_key` são a fonte confiável para a signed URL; `media_url` permanece para mídia pública ou legada.

Mídia adulta legada sem metadata privada confiável não pode renderizar URL direta. A migration 39B é pré-requisito do fluxo 39C em produção.

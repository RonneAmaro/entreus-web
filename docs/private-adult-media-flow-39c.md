# Fluxo privado de mídia adulta (39C)

Uploads adultos novos são presignados em `protected/adult-post-media/` e não recebem URL pública permanente. O compositor grava provider R2, bucket, key e `access_level = adult_private` em `post_media`; `media_url` fica nula.

A rota de download assinado autentica o solicitante, depende de RLS para post/mídia, valida classificação do post e opt-in 18+ aprovado. Ela retorna somente URL temporária, expiração e tipo de mídia. `ProtectedPostMedia` requisita essa URL para `adult_private`; mídia adulta antiga sem metadata confiável exibe placeholder e não reutiliza URL legada.

O backfill é operação manual futura: copiar objetos legados para área protegida, atualizar metadata, verificar os agregados e só então retirar referências públicas. Este pacote não aplica migration, move ou apaga arquivos.

## Checklist operacional

1. Confirmar que a migration 39B está aplicada.
2. Publicar imagem e vídeo adultos novos; confirmar `access_level = adult_private`, `storage_key` preenchida e ausência de URL pública permanente em `media_url`.
3. Confirmar que o PostCard usa `ProtectedPostMedia`.
4. Confirmar placeholder para usuário sem permissão e mídia adulta legada sem metadata.
5. Confirmar que adulto aprovado com opt-in recebe URL temporária e que a resposta não contém bucket, key ou provider.

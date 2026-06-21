# Verificação pós-migration no Supabase

No SQL Editor, executar manualmente `supabase/sql/verify-adult-content-rls.sql` e `supabase/sql/verify-post-media-storage-metadata.sql`. Não executar migrations, não copiar linhas de usuários, posts, mídia, URLs ou keys.

O primeiro arquivo deve confirmar policies RLS esperadas nas tabelas de conteúdo e dependências. Investigue policy ausente, tabela sem RLS ou resultado incompatível com o checklist de acesso.

O segundo deve confirmar as colunas `storage_provider`, `storage_bucket`, `storage_key` e `access_level`, constraints, índices e apenas contagens agregadas. Observar especialmente `adult_private_without_storage_key`, `adult_private_with_legacy_media_url` e totais potencialmente públicos/legados: valores não nulos indicam risco a avaliar, não dados para exportar.

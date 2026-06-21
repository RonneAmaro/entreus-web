# Risco residual: mídia adulta em storage público

Esta migration protege linhas de posts, mídias e interações, mas não torna privadas URLs já publicadas. Os buckets `post-images` e `post-videos` têm leitura pública: quem possuir uma URL pode acessá-la fora do RLS das tabelas.

Não alteramos `storage.objects` neste pacote. A correção exige um pacote separado para bucket privado/R2 protegido com signed URLs, ou separação física de mídia adulta antes da publicação.

# Risco residual: mídia adulta em storage público

RLS protege metadados e tabelas, mas não torna privadas URLs públicas já emitidas. Mídia segura pode continuar pública; mídia adulta nova deve evitar URL pública permanente.

## Estado após o Pacote 39C

O 39C protege uploads adultos novos com `adult_private` e signed URL temporária. Não houve alteração automática de buckets, movimentação ou exclusão de arquivos.

Mídia adulta antiga com `media_url` pública continua sendo risco até um backfill seguro. O próximo passo futuro é copiar os objetos adultos antigos para área protegida, salvar provider/bucket/key confiáveis, verificar os agregados e somente então retirar referências públicas.

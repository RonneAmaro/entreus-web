# Checklist de prontidão para criadores

## Obrigatório antes de criador adulto

- Migration RLS e migration 39B aplicadas e verificadas manualmente.
- Todos os casos bloqueados e autorizados do plano QA passam.
- Upload adulto novo grava `adult_private`; signed URL não expõe metadata.
- Mídia adulta legada foi identificada; existe plano de backfill antes de depender dela.
- Riscos de URLs públicas antigas foram aceitos explicitamente ou mitigados.

## Obrigatório antes de criador grande não adulto

- Feed, perfil, post, salvos e interações seguras passam regressão.
- RLS e auditorias locais passam; mídia segura continua disponível.
- Para criadores de esportes, geopolítica ou militar, validar moderação, classificação e fluxo de denúncia, além de regressão de upload seguro.

## Recomendado antes de beta público

- Executar `npm.cmd run qa:18plus`, build, testes unitários e checklist manual.
- Fazer QA em navegador e dispositivo móvel com contas de teste.
- Preparar processo aprovado de backfill adulto e monitoramento de falhas de signed URL.

## Pode ficar para depois

- Backfill efetivo de objetos adultos legados, desde que o placeholder continue bloqueando-os.
- Automação end-to-end com Supabase/R2 reais; nunca deve usar produção ou expor mídia.

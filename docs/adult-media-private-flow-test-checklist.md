# Checklist manual: fluxo privado de mídia adulta

Use também o [plano QA completo](qa-18plus-private-media-test-plan.md) e o [checklist de prontidão de criadores](creator-readiness-security-checklist.md). Execute o preflight local com `npm.cmd run qa:18plus`.

- Visitante, menor, adulto não verificado e adulto sem opt-in recebem bloqueio seguro.
- Adulto aprovado com opt-in e admin autorizado recebem signed URL temporária apenas para mídia adulta nova.
- Post seguro com imagem e vídeo continua normal.
- Post adulto novo usa `access_level = adult_private`, sem URL pública permanente e com `ProtectedPostMedia`.
- Post adulto legado sem metadata mostra placeholder; `media_url` não é renderizada.
- Confirmar feed, post individual, perfil público, salvos e admin/reports conforme permissão.
- Inspecionar resposta e HTML: bucket, `storage_key`, provider e URL pública adulta não podem aparecer.

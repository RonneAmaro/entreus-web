# Checklist manual: fluxo privado de mídia adulta

Execute sem registrar URLs, keys, conteúdo ou dados pessoais.

- Visitante/deslogado, menor, adulto não verificado e adulto verificado sem opt-in: bloqueio seguro na API e interface.
- Adulto verificado com opt-in e admin autorizado: signed URL temporária apenas para mídia adulta nova.
- Post seguro com imagem e vídeo continua normal.
- Post adulto novo com imagem e vídeo: `access_level = adult_private`, sem URL pública permanente e com `ProtectedPostMedia`.
- Post adulto legado sem metadata: placeholder; `media_url` não é renderizada.
- Verificar feed, post individual, perfil público, salvos e admin/reports conforme a permissão.
- Inspecionar resposta e HTML: bucket, `storage_key`, provider e URL pública adulta não podem aparecer.

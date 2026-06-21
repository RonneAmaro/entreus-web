# Mídia adulta protegida e signed URLs

## Implementação 39C

A rota real é `GET /api/post-media/[mediaId]/signed-url`. Ela exige usuário autenticado, consulta mídia e post pai sob RLS, valida a classificação 18+ e bloqueia menor, conta não verificada ou sem opt-in. A signed URL R2 expira em 10 minutos.

A resposta nunca retorna bucket, key ou provider. O erro bloqueado é sempre `Este conteúdo não está disponível para sua conta.`

- Mídia pública segura: usa sua URL pública normal.
- Mídia adulta privada nova: usa metadata confiável e signed URL temporária.
- Mídia adulta legada sem metadata: recebe placeholder e não reutiliza `media_url`.

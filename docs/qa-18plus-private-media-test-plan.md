# Plano QA: 18+ e mídia adulta privada

Não registre URLs, keys, tokens, texto adulto ou dados pessoais. Use contas de teste e anote apenas o resultado, horário e identificador interno do caso.

## Matriz de acesso

Para visitante, usuário comum sem verificação, menor, usuário com consentimento parental, adulto verificado sem opt-in, adulto verificado com opt-in e admin, execute: abrir feed, post seguro, link direto para post adulto, perfil público, salvos e tentativa de comentário adulto. Em todos os perfis bloqueados, o esperado é ausência do post adulto ou a mensagem segura; consentimento parental não libera 18+. Para adulto com opt-in e admin autorizado, o post adulto permitido é visível conforme RLS.

Em caso de falha, pare o teste, não copie mídia/URL e registre o perfil, tela, ação e se houve exposição de metadata.

## Fluxos de publicação e mídia

| Caso | Pré-condição e passos | Esperado |
| --- | --- | --- |
| Post seguro imagem/vídeo | Publicar arquivo permitido em comunidade segura. | Upload e renderização pública existentes continuam funcionando. |
| Post adulto imagem/vídeo | Adulto aprovado com opt-in; selecionar classificação adulta e publicar. | `access_level` é `adult_private`, existe `storage_key`, não há `media_url` pública permanente. |
| Visualização autorizada | Abrir mídia adulta nova com adulto aprovado. | `ProtectedPostMedia` busca URL temporária e renderiza. |
| Visualização bloqueada | Repetir com visitante, menor, não verificado e sem opt-in. | Placeholder seguro; sem mídia, key ou URL no HTML. |
| Legado | Abrir mídia adulta sem metadata privada confiável. | Placeholder `Mídia protegida indisponível`; nunca reutiliza `media_url`. |

## API signed URL

Com uma mídia adulta nova de teste, solicitar `GET /api/post-media/[mediaId]/signed-url` somente nas contas acima. Para autorizado, confirmar URL temporária e expiração; para bloqueado, confirmar erro genérico. Em qualquer resposta, confirmar ausência de `bucket`, `key`, `provider`, `storage_key` e `storage_bucket`.

## Regressão de interação

Curtir e comentar post seguro deve funcionar. Tentar comentar post adulto sem permissão deve ser bloqueado. Repetir a navegação de feed, post individual, perfil público e salvos para garantir que nenhum contexto mostra mídia ou post adulto ao perfil bloqueado.

# Moderacao de avatar e capa

## Objetivo e escopo

Avatar, capa, nome e biografia formam a identidade publica. Para perfis `adult` e `mixed`, novos avatares e capas passam por revisao manual antes de substituir a imagem aprovada. Perfis `general` preservam o fluxo atual nesta primeira versao. Uma etapa futura deve avaliar a extensao da fila a todos os perfis.

Nao ha segundo avatar/capa adulto, classificacao automatica nem dependencia de IA. Nudez explicita, genitais, atos sexuais, foco sexual explicito, violencia sexual, conteudo ilegal e menoridade aparente em contexto sensual nao sao aceitos em identidade publica. Rosto, selfie, roupa comum, cosplay seguro, moda praia sem nudez e arte nao explicita podem ser aprovados. Lingerie, transparencia, foco corporal, pose fortemente sensual ou idade aparente ambigua exigem revisao cuidadosa; na duvida sobre menoridade aparente, recusar ou pedir troca, sem alegar determinacao juridica de idade.

## Fluxo do usuario

O presign identifica o modo do perfil no servidor. Para `adult`/`mixed`, cria uma chave `protected/profile-media/<user>/...`, sem URL publica no payload. Depois do PUT direto ao R2, `POST /api/profile/media-submissions` recebe somente `mediaType` e `storageKey`. A rota valida o Bearer com `auth.getUser()`, consulta o modo no banco e executa `HeadObject`. Em seguida chama `create_profile_media_submission` com service role. A RPC usa lock transacional por usuario/tipo, cancela a pendencia anterior e insere a nova atomicamente; se o insert falhar, toda a transacao volta e a pendencia anterior permanece.

O objeto precisa existir, ter tamanho positivo e respeitar 5 MB para avatar ou 10 MB para capa. Somente `image/jpeg`, `image/png` e `image/webp` sao aceitos; GIF, SVG, HTML e XHTML ficam fora deste pacote. Uma pendencia anterior do mesmo tipo e cancelada. O avatar/capa aprovado em `profiles` permanece intacto (ou continua o fallback visual).

Estados: `pending_review`, `approved`, `rejected`, `change_requested` e `cancelled`. Recusa e pedido de troca preservam a imagem publica e guardam um motivo visivel somente ao dono e ao admin. Um novo envio e permitido. A fila nao modifica `wants_18_plus`, verificacao de idade ou classificacao de posts.

## Fluxo administrativo

`/admin/profile-media` usa APIs autenticadas com headers privados completos e sem cache. A listagem remove bucket e storage key do resultado e fornece somente uma signed URL R2 temporaria (5 a 15 minutos) para preview. Aprovar, recusar e pedir troca exigem exatamente o papel `admin`, a mesma regra de `lib/admin.ts`; recusa/troca exigem motivo.

Na aprovacao, a API executa novo `HeadObject` e copia para `profile-media/public/<user>/<uuid>` com extensao derivada do MIME validado (`.jpg`, `.png` ou `.webp`). `CopySource` codifica cada segmento sem perder as barras. Outro `HeadObject` confirma MIME e tamanho idênticos e maiores que zero. A URL publica final e formada exclusivamente no servidor; a base deve ser HTTPS, sem credenciais, query ou hash. A RPC nunca concatena a chave `protected/`, exige categoria `safe`, bloqueia a linha com `FOR UPDATE`, impede decisao dupla e atualiza perfil e submissao na mesma transacao.

## Armazenamento, RLS e seguranca

`profile_media_submissions` mantém metadados e historico minimo. Nao existem policies de tabela para usuarios autenticados, inclusive admins no navegador: leitura e toda escrita passam pelas APIs server-side com service role. O bucket nao integra a linha nem pode ser definido pelo cliente; a API/RPC definem usuario, provider, MIME verificado, chave e status. Credenciais R2, service role, bucket, storage key e URL privada permanente nao sao retornados.

A migration e apenas revisavel e nao deve ser aplicada automaticamente. Antes de aplica-la, confirmar que `public.is_admin()` existe e configurar o ambiente server-side usado pela rota com a base publica R2 ja existente. Arquivos cancelados/recusados nao sao apagados automaticamente. Se a copia publica terminar mas a RPC falhar, a API registra a chave apenas no banco em `profile_media_copy_orphans`, sem expo-la em resposta ou log. Limpeza segura e politica de retencao ficam como trabalho futuro.

## Fallback manual e evolucao

Todo envio adulto/misto cai em `pending_review`. Uma futura interface em `lib/moderation/providers` pode sugerir `safe`, `review` ou `prohibited`, mas indisponibilidade, timeout ou erro do provedor deve manter a revisao manual e nunca quebrar o upload. IA nao deve decidir juridicamente idade. Um pacote futuro pode adicionar triagem, quarentena/retencao mais forte e moderacao para perfis gerais.

## Teste manual

1. Entrar com perfil `mixed`, enviar avatar e confirmar `pending_review`.
2. Em janela anonima, confirmar que o avatar anterior continua.
3. Como admin, abrir `/admin/profile-media`, confirmar preview temporario e aprovar.
4. Reabrir o perfil publico e confirmar o novo avatar.
5. Enviar capa, recusar com motivo e confirmar que a capa anterior continua.
6. Confirmar que o dono ve o motivo e outro usuario nao ve a submissao.
7. No Network, confirmar ausencia de storage key/bucket nas respostas de usuario e admin e `Cache-Control: private, no-store`.
8. Confirmar que o upload nao ativa 18+, nao altera posts e que decisao repetida falha.

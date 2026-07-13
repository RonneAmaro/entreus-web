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

A rota visual usa um guard cliente porque a autenticacao atual esta em `localStorage`. Seu estado inicial e fechado: enquanto a API administrativa nao retorna `200`, fila, usuarios, previews e botoes nao sao renderizados. `401` redireciona para login, `403` para o feed e outras falhas exibem apenas um erro neutro. A seguranca dos dados e das acoes administrativas e garantida pelas Route Handlers server-side, que validam `auth.getUser()` e o papel no banco; migracao global para cookies/SSR fica em pacote separado.

Na aprovacao, a API executa novo `HeadObject` e copia para `profile-media/public/<user>/<uuid>` com extensao derivada do MIME validado (`.jpg`, `.png` ou `.webp`). `CopySource` codifica cada segmento sem perder as barras. Outro `HeadObject` confirma MIME e tamanho idênticos e maiores que zero. A URL publica final e formada exclusivamente no servidor; a base deve ser HTTPS, sem credenciais, query ou hash. A RPC nunca concatena a chave `protected/`, exige categoria `safe`, bloqueia a linha com `FOR UPDATE`, impede decisao dupla e atualiza perfil e submissao na mesma transacao.

## Armazenamento, RLS e seguranca

`profile_media_submissions` mantém metadados e historico minimo. Nao existem policies de tabela para usuarios autenticados, inclusive admins no navegador: leitura e toda escrita passam pelas APIs server-side com service role. O bucket nao integra a linha nem pode ser definido pelo cliente; a API/RPC definem usuario, provider, MIME verificado, chave e status. Credenciais R2, service role, bucket, storage key e URL privada permanente nao sao retornados.

A migration e apenas revisavel e nao deve ser aplicada automaticamente. Antes de aplica-la, confirmar que `public.is_admin()` existe e configurar o ambiente server-side usado pela rota com a base publica R2 ja existente. Arquivos cancelados/recusados nao sao apagados automaticamente. Se a copia publica terminar mas a RPC falhar, a API registra a chave apenas no banco em `profile_media_copy_orphans`, sem expo-la em resposta ou log. O ciclo de retencao, validacao, retry e exclusao confirmada esta em `docs/profile-media-orphan-cleanup.md`.

## Fallback manual e evolucao

Todo envio adulto/misto cai em `pending_review`. Uma futura interface em `lib/moderation/providers` pode sugerir `safe`, `review` ou `prohibited`, mas indisponibilidade, timeout ou erro do provedor deve manter a revisao manual e nunca quebrar o upload. IA nao deve decidir juridicamente idade. Um pacote futuro pode adicionar triagem, quarentena/retencao mais forte e moderacao para perfis gerais.

## Teste manual

Use duas contas separadas: um criador `mixed` ou `adult` e um administrador.

1. Entrar como criador.
2. Enviar um avatar JPEG e confirmar a mensagem de imagem em analise e o estado `pending_review`.
3. Abrir o perfil publico em janela anonima e confirmar que o avatar anterior continua.
4. Entrar como administrador em outra sessao.
5. Abrir `/admin/profile-media` e confirmar que o preview usa URL temporaria.
6. Aprovar com categoria `safe`.
7. Reabrir o perfil publico anonimo e confirmar o avatar atualizado pela copia `profile-media/public/`.
8. Voltar ao criador e enviar uma capa WebP.
9. Como admin, recusar com categoria `prohibited` e motivo.
10. Confirmar que a capa anterior permanece e que o criador ve o motivo.
11. Enviar outra capa e usar `Pedir troca` com categoria `review` e orientacao.
12. Confirmar `change_requested`, preservacao da capa e possibilidade de novo envio.
13. No Network, conferir `Cache-Control`, `Pragma`, `Expires` e `Vary` nas tres APIs de moderacao.
14. Confirmar que os payloads nao exibem bucket, storage keys, tokens, `CopySource` ou secrets.
15. Tentar abrir diretamente a URL publica correspondente ao prefixo `protected/profile-media/` e confirmar bloqueio anonimo.
16. Confirmar que usuario comum e cliente publico nao acessam a fila, tabelas ou RPCs e que uma segunda decisao da mesma submissao recebe conflito.

Sem fixtures locais de Supabase/R2, aprovacao real, concorrencia no PostgreSQL e isolamento do prefixo protegido permanecem verificacoes manuais obrigatorias. O pacote futuro de orfaos deve cobrir retencao, tentativas de exclusao segura e trilha de auditoria; esta versao apenas registra o objeto para limpeza posterior.

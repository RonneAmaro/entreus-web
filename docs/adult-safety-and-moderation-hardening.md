# Segurança 18+ e moderação reforçada

## Regra central

`lib/content-access.ts` é a fonte única para decidir a classificação e o acesso. Um post é adulto se **qualquer** campo indicar `adult_18plus`; nesse caso a normalização sempre produz os dois campos como `adult_18plus`.

Conteúdo adulto só pode ser visto ou criado por uma conta autenticada que seja explicitamente não menor (`is_minor = false`), tenha feito opt-in (`wants_18_plus = true`) e possua `age_verification_status = approved`. Dados ausentes ou status desconhecido bloqueiam. Consentimento parental não substitui verificação 18+ e nunca libera conteúdo adulto. Conteúdo `general/safe` continua público; `sensitive` mantém o overlay já existente e não é tratado como adulto.

## Rotas e criação auditadas

- Feed geral consulta `general/safe` e também filtra essa regra antes da renderização.
- Perfil público, salvos e post individual usam a mesma classificação para bloquear posts adultos; a página individual mostra apenas a mensagem segura quando bloqueada.
- O `PostComposer` bloqueia a seleção/submissão para contas não elegíveis. A inserção do feed agora normaliza os dois campos juntos, inclusive quando o rating adulto é a entrada recebida.
- `PostCard` recebe posts somente depois dos filtros das telas; mídia só é carregada após a decisão de acesso na página individual.

## Verificação de idade

O fluxo existente armazena solicitações em `age_verification_requests`. A aprovação administrativa atual atualiza `profiles.age_verification_status` para `approved`; rejeição mantém o bloqueio e atualiza para `rejected`. Os arquivos de documento permanecem privados e a rota `app/api/admin/age-verifications/signed-url/route.ts` exige administrador antes de emitir URL assinada. Usuários comuns não recebem essa URL.

## Moderação

Administração de denúncias preserva o acesso para administradores e agora busca `community_type` e `content_rating` junto do contexto do post reportado, para que indicadores de classificação possam ser exibidos sem expor o post em fluxos comuns. O fluxo existente permite análise, recusa, ocultação, restauração e notificação do criador ao ocultar.

## Limitações e próximos passos

As telas usam o cliente Supabase e, embora filtrem antes de renderizar, a proteção definitiva contra qualquer resposta direta exige uma auditoria específica de RLS/consultas server-side para `posts` e `post_media`. Esta alteração não modifica RLS: isso deve ser decidido e documentado em pacote próprio, pois pode afetar feed, perfil, salvos e post individual.

Também faltam testes E2E autenticados com usuários fictícios, um painel de moderação com labels explícitos para classificação, termos específicos para conteúdo adulto e uma busca server-side com filtro adulto. A migration de `profiles.profile_theme` ainda é referenciada pelo código; não foi alterada neste pacote e deve estar aplicada antes de remover os fallbacks existentes.

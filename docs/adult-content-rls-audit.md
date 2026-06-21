# Auditoria RLS de conteúdo adulto

## Resultado

As migrations versionadas definem `profiles.is_minor`, `profiles.wants_18_plus`, `profiles.age_verification_status` e `public.is_admin()`. Elas contêm RLS específico para denúncias e verificação de idade, mas não há policy versionada para leitura de `posts` ou `post_media`. Isso é um risco: filtros de interface não substituem RLS.

## Controles reforçados

`lib/post-visibility.ts` aplica antes do `select` filtros de banco para feed geral (`general/safe`) e, para visitante, menor ou usuário não verificado, exclui qualquer campo `adult_18plus`. Feed, perfil público, salvos e post individual usam o helper; a consulta individual não retorna a linha adulta bloqueada, portanto não carrega texto ou mídia.

O script `npm.cmd run audit:adult-access` mapeia leitores de `posts` por sinais estáticos e cria relatórios locais ignorados pelo Git. Ele não lê dados do Supabase, `.env`, URLs ou conteúdo de posts.

## RLS

## Requisitos mínimos de RLS para 18+

- Anônimo, menor, conta sem verificação aprovada e consentimento parental não leem adulto.
- Adulto aprovado com opt-in lê adulto no contexto 18+; admin modera somente no contexto administrativo.
- `post_media`, comentários, notificações e storage não podem vazar mídia ou preview adulto.

Não foi criada migration RLS automática. Habilitar RLS ou substituir policies sem o schema/policies efetivamente aplicados pode interromper leituras seguras existentes. A proposta para staging é: preservar as policies existentes de posts, criar uma policy `SELECT` que permita `adult_18plus` somente quando `public.is_admin()` ou quando o perfil de `auth.uid()` tiver `is_minor = false`, `wants_18_plus = true` e `age_verification_status = 'approved'`; manter safe/sensitive público conforme a policy existente; e aplicar regra equivalente a `post_media` via `exists` no post pai.

Antes de aplicar, exporte policies reais do ambiente, teste visitante/menor/não verificado/adulto aprovado/admin e valide feed, perfil, salvos, post individual, denúncias e moderação. Não aplicar migrations automaticamente.

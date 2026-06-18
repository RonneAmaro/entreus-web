# Migracao de avatars e banners para R2

## Objetivo

Avatares e banners de perfil aparecem em telas publicas como feed, busca, mensagens, perfil publico e areas administrativas. Por isso, esses arquivos devem ficar no Cloudflare R2, mantendo o Supabase para banco, Auth, RLS e metadados.

Este pacote trata apenas:

- `profiles.avatar_url`
- `profiles.banner_url`

Mensagens privadas, Meet, verificacao 18+, documentos sensiveis, pagamentos, ItaCash e Mercado Pago ficam fora deste pacote.

## Novos uploads

A pagina de perfil usa `/api/r2/presign` e envia o arquivo direto para o R2 por PUT.

Prefixos usados:

- `profiles/avatars/{userId}/...`
- `profiles/banners/{userId}/...`

O banco continua salvando a URL publica R2 nos campos existentes `avatar_url` e `banner_url`.

## Dry-run

```powershell
npm.cmd run profile-media:migrate:dry-run
```

O dry-run:

- le `profiles.avatar_url` e `profiles.banner_url`;
- classifica URLs como `supabase-storage`, `cloudflare-r2`, `external-url`, `local-public`, `empty/null` ou `unknown`;
- lista candidatos Supabase Storage;
- nao baixa arquivo;
- nao sobe arquivo;
- nao atualiza banco;
- nao apaga nada.

Relatorio:

```powershell
reports/profile-media-migration-dry-run.json
```

## Execute

```powershell
npm.cmd run profile-media:migrate:execute
```

O execute:

- processa apenas candidatos Supabase Storage de avatar/banner;
- baixa o objeto original do Supabase Storage;
- envia para R2 com chave deterministica;
- confirma o objeto no R2;
- atualiza somente o campo correspondente em `profiles`;
- mantem a origem no Supabase Storage;
- registra falhas como warnings e continua.

Relatorio:

```powershell
reports/profile-media-migration-execute.json
```

## Repair do banco

Se uma execucao ja confirmou objetos no R2, mas falhou antes de atualizar `profiles.avatar_url` ou `profiles.banner_url`, use:

```powershell
npm.cmd run profile-media:migrate:repair-db
```

Esse modo:

- recalcula a chave deterministica esperada no R2 a partir da linha real de `profiles`;
- confirma que o objeto ja existe no R2;
- nao baixa o arquivo do Supabase Storage;
- nao faz novo upload para o R2;
- atualiza apenas o campo ainda apontando para a URL Supabase original;
- trata campo ja em R2 como sucesso idempotente.

Relatorio:

```powershell
reports/profile-media-migration-repair-db.json
```

## Validacao depois da execucao

1. Rodar novamente o dry-run e confirmar `0` candidatos Supabase Storage em `profiles.avatar_url` e `profiles.banner_url`.
2. Abrir `/profile` e testar novo upload de avatar e banner.
3. Abrir perfis publicos em `/u/{username}` e confirmar que avatar/banner carregam.
4. Conferir que as novas URLs usam o dominio publico do R2.
5. Manter os arquivos antigos no Supabase Storage ate uma janela de observacao definida.

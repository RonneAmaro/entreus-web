# Migracao de verificacao de idade para R2

## Objetivo

Este pacote migra somente os arquivos da area `sensitive-age-verification`
para Cloudflare R2 protegido. Os campos tratados sao:

- `age_verification_requests.document_front_path`
- `age_verification_requests.document_back_path`
- `age_verification_requests.selfie_path`

Ficam fora deste pacote `sensitive-payment-proofs`, consentimento parental,
Meet/LiveKit, mensagens privadas, posts publicos, perfis publicos, ItaCash,
Mercado Pago e migrations SQL.

## Privacidade

Arquivos de verificacao de idade podem conter documento pessoal, rosto, selfie
e outros dados sensiveis. Eles nao devem ser servidos como URL publica simples.

O banco passa a guardar uma key privada no formato:

```text
private/age-verifications/{verificationId}/{field}/migrated-{hash}.{ext}
```

A tela admin continua pedindo acesso por:

```text
POST /api/admin/age-verifications/signed-url
```

A rota exige usuario autenticado, valida role admin e recebe apenas
`requestId` + `documentKind`. Ela busca o registro no banco, confirma o campo
correspondente e gera uma URL temporaria de Supabase Storage legado ou R2
protegido. O cliente nunca envia path bruto.

Se a infraestrutura tiver bucket privado separado, use
`R2_AGE_VERIFICATION_BUCKET_NAME` ou `R2_PRIVATE_BUCKET_NAME`. Sem essas
variaveis, o script usa `R2_BUCKET_NAME`, mas a aplicacao nao salva URL publica
nos campos sensiveis.

## Dry-run

```powershell
npm.cmd run age-verification-files:migrate:dry-run
```

O dry-run:

- le somente os tres campos de `age_verification_requests`;
- classifica `supabase-storage`, `cloudflare-r2`, `external-url`,
  `local-public`, `empty/null` e `unknown`;
- nao baixa arquivos;
- nao envia arquivos;
- nao atualiza banco;
- nao apaga nada;
- grava `reports/age-verification-files-migration-dry-run.json`;
- mascara URLs, paths, nomes de arquivo e exemplos sensiveis.

## Execute

```powershell
npm.cmd run age-verification-files:migrate:execute
```

O execute:

- processa apenas candidatos `supabase-storage` de `sensitive-age-verification`;
- baixa o objeto original do bucket privado `age-verifications`;
- envia para R2 em `private/age-verifications/...`;
- pula upload se o objeto ja existir no R2;
- atualiza somente o campo correspondente no banco;
- confirma o update com leitura posterior;
- nao salva URL publica;
- nao apaga a origem no Supabase Storage;
- nao apaga objetos no R2;
- grava `reports/age-verification-files-migration-execute.json`.

## Validacao

Antes de executar:

```powershell
npm.cmd run build
npm.cmd run age-verification-files:migrate:dry-run
node -e "const r=require('./reports/age-verification-files-migration-dry-run.json'); console.log(JSON.stringify(r,null,2).slice(0,12000))"
```

Depois do execute:

```powershell
npm.cmd run media:migration:extended-dry-run
node -e "const r=require('./reports/media-migration-extended-dry-run.json'); console.log(JSON.stringify({totals:r.totals, byArea:r.totals?.byArea||r.byArea},null,2).slice(0,12000))"
npm.cmd run build
```

O resultado esperado e `sensitive-age-verification.supabase-storage = 0`.
O restante esperado fora do escopo e `sensitive-payment-proofs = 4`.

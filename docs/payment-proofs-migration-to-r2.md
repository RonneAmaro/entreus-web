# Migracao de comprovantes de pagamento para R2

## Objetivo

Este pacote migra somente a area `sensitive-payment-proofs` para Cloudflare
R2 protegido. Os campos tratados sao:

- `itacash_purchase_requests.proof_path`
- `itacash_purchase_requests.proof_url`

Ficam fora deste pacote posts, perfis, mensagens privadas, verificacao de
idade, Meet/LiveKit, consentimento parental, Mercado Pago webhook, saldos,
regras de aprovacao/recusa, RPCs e migrations SQL.

## Privacidade

Comprovantes de pagamento podem revelar dados bancarios e dados pessoais.
Eles nao devem ser salvos como URL publica simples nem aparecer em relatorios
com path, nome real de arquivo, chave Pix, CPF, pagador, valor ou banco.

O banco passa a guardar uma key privada em R2 sob:

```text
private/payment-proofs/...
```

A tela admin pede acesso por:

```text
POST /api/admin/itacash-purchases/payment-proof/signed-url
```

A rota exige usuario autenticado, valida role admin e recebe apenas
`requestId`. Ela busca o registro no banco e gera uma URL temporaria para o
legado no Supabase Storage ou para o objeto privado no R2. O cliente nunca
envia path bruto.

Se a infraestrutura tiver bucket privado separado, use
`R2_PAYMENT_PROOFS_BUCKET_NAME` ou `R2_PRIVATE_BUCKET_NAME`. Sem essas
variaveis, o script usa `R2_BUCKET_NAME`, mas a aplicacao nao salva URL publica
nos campos sensiveis.

## Dry-run

```powershell
npm.cmd run payment-proofs:migrate:dry-run
```

O dry-run:

- le somente os dois campos de `itacash_purchase_requests`;
- classifica `supabase-storage`, `cloudflare-r2`, `external-url`,
  `local-public`, `empty/null` e `unknown`;
- nao baixa arquivos;
- nao envia arquivos;
- nao atualiza banco;
- nao apaga nada;
- grava `reports/payment-proofs-migration-dry-run.json`;
- mascara paths, nomes, identificadores, URLs assinadas e detalhes de pagamento.

## Execute

```powershell
npm.cmd run payment-proofs:migrate:execute
```

O execute:

- processa apenas candidatos `supabase-storage` de `sensitive-payment-proofs`;
- baixa o objeto original do bucket privado `payment-proofs`;
- envia para R2 em `private/payment-proofs/...`;
- pula upload se o objeto ja existir no R2;
- contabiliza campos que ja estejam em R2 como `alreadyInDatabase`;
- atualiza somente o campo correspondente no banco;
- confirma o update com leitura posterior;
- nao salva URL publica;
- nao apaga a origem no Supabase Storage;
- nao apaga objetos no R2;
- grava `reports/payment-proofs-migration-execute.json`.

## Validacao

Antes de executar:

```powershell
npm.cmd run build
npm.cmd run payment-proofs:migrate:dry-run
node -e "const r=require('./reports/payment-proofs-migration-dry-run.json'); console.log(JSON.stringify({before:r.before,candidates:r.candidates,warnings:r.warnings},null,2).slice(0,12000))"
```

Depois do execute:

```powershell
npm.cmd run media:migration:extended-dry-run
node -e "const r=require('./reports/media-migration-extended-dry-run.json'); console.log(JSON.stringify({totals:r.totals, candidateTotals:r.candidateTotals},null,2).slice(0,12000))"
npm.cmd run build
```

O resultado esperado e `sensitive-payment-proofs.supabase-storage = 0`.

# .env.local Maintenance

## Objetivo

Este pacote cria uma ferramenta segura para auditar e normalizar `.env.local` sem imprimir valores sensiveis.

Variaveis duplicadas causam problema porque cada carregador de ambiente pode decidir uma regra diferente. Alguns scripts podem manter a primeira ocorrencia; outros podem deixar a ultima vencer. A regra operacional adotada aqui e simples: ao normalizar, a ultima ocorrencia de cada variavel e mantida e as ocorrencias anteriores sao removidas.

## Garantias

O script:

- nao imprime valores;
- nao grava secrets nos relatorios;
- nao altera banco;
- nao faz upload;
- nao apaga arquivos remotos;
- nao cria migration SQL;
- nao toca em `.env.local.example`;
- cria backup antes de qualquer alteracao real em `.env.local`.

`.env.local` e os backups `.env.local.bak-env-cleanup-*` nunca devem ser commitados.

## Auditoria

```powershell
npm.cmd run env:audit
```

Relatorios:

- `reports/env-local-audit.json`
- `reports/env-local-audit.md`

A auditoria mostra apenas:

- total de linhas;
- total de atribuicoes;
- variaveis duplicadas;
- ocorrencias e linhas das duplicadas;
- ultima linha de cada variavel duplicada;
- presenca `true/false` das variaveis principais.

## Dry Run

```powershell
npm.cmd run env:normalize:dry-run
```

Relatorios:

- `reports/env-local-normalize-dry-run.json`
- `reports/env-local-normalize-dry-run.md`

O dry-run nao altera `.env.local`. Ele informa:

- quais variaveis seriam deduplicadas;
- quantas linhas seriam removidas;
- qual caminho de backup seria usado no modo write.

## Aplicar Limpeza

Use somente depois de revisar o dry-run:

```powershell
npm.cmd run env:normalize:write
```

Relatorios:

- `reports/env-local-normalize-write.json`
- `reports/env-local-normalize-write.md`

O write cria um backup antes de reescrever `.env.local`:

```text
.env.local.bak-env-cleanup-YYYYMMDD-HHMMSS
```

Depois remove as atribuicoes duplicadas anteriores e preserva a ultima ocorrencia de cada variavel.

## Restaurar Backup

Se precisar desfazer a limpeza, feche processos que possam ler `.env.local` e restaure manualmente:

```powershell
Copy-Item .env.local.bak-env-cleanup-YYYYMMDD-HHMMSS .env.local
```

Nao apague o backup durante a validacao.

## Validacao Recomendada

Depois de aplicar a limpeza:

```powershell
npm.cmd run env:audit
npm.cmd run watchdog:supabase-r2
npm.cmd run build
git status --short
```

Tambem e seguro validar somente booleanos de presenca via Node, sem imprimir valores:

```powershell
node --env-file=.env.local -e "console.log({hasSupabaseUrl:!!process.env.NEXT_PUBLIC_SUPABASE_URL, hasServiceRole:!!process.env.SUPABASE_SERVICE_ROLE_KEY, hasR2:!!process.env.R2_BUCKET_NAME, hasResend:!!process.env.RESEND_API_KEY, hasAlertEmail:!!process.env.WATCHDOG_ALERT_EMAIL, hasAlertFrom:!!process.env.WATCHDOG_ALERT_FROM, hasCooldown:!!process.env.WATCHDOG_ALERT_COOLDOWN_HOURS})"
```

## Variaveis Conferidas

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL`
- `RESEND_API_KEY`
- `WATCHDOG_ALERT_EMAIL`
- `WATCHDOG_ALERT_FROM`
- `WATCHDOG_ALERT_COOLDOWN_HOURS`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `MERCADO_PAGO_ACCESS_TOKEN`

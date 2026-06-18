# Supabase/R2 Watchdog

## Objetivo

O watchdog verifica se o EntreUS continua usando Supabase para banco/Auth/RLS/metadados e Cloudflare R2 para arquivos publicos, midias, uploads, avatares, banners, videos e anexos.

Ele alerta localmente quando:

- Supabase nao responde a uma consulta leve.
- Variaveis essenciais do R2 estao ausentes.
- A auditoria estendida encontra referencias de Supabase Storage.
- A auditoria estendida retorna warnings.

## Como rodar

```powershell
npm.cmd run watchdog:supabase-r2
```

Relatorios gerados:

- `reports/supabase-r2-watchdog.json`
- `reports/supabase-r2-watchdog.md`

## Severidade

- `ok`: Supabase responde, R2 esta configurado, nao ha warnings e nao ha candidatos Supabase Storage.
- `warning`: ha warnings na auditoria ou configuracao R2 incompleta.
- `critical`: Supabase nao responde/restrito ou voltou a existir midia em Supabase Storage nos campos auditados.

## Garantias

O watchdog nao:

- altera banco;
- faz upload;
- apaga arquivos no Supabase Storage;
- apaga objetos no R2;
- migra arquivos;
- imprime secrets, tokens ou signed URLs.

## Quota Supabase

Este pacote ainda nao le uso real de quota/cached egress do Supabase.

O relatorio inclui `usageQuota.available: false` com o motivo:

```text
Uso real de quota Supabase ainda nao integrado neste pacote
```

Alertas de 50%, 75% e 90% ficam para uma fase futura, quando houver API confiavel e token adequado para leitura de usage/billing sem scraping do painel.

## Agendamento Futuro no Windows

Um agendamento simples pode chamar o comando no Windows Task Scheduler:

```powershell
cd C:\Porjetos\EntreUS\entreus-web
npm.cmd run watchdog:supabase-r2
```

Sugestao futura:

- rodar diariamente ou a cada poucas horas;
- armazenar o historico dos JSONs com timestamp;
- alertar por e-mail/cron externo apenas em `warning` ou `critical`.

## E-mail

O script detecta se `RESEND_API_KEY` e `WATCHDOG_ALERT_EMAIL` existem, mas nao envia e-mail neste pacote para evitar dependencia nova e manter a execucao simples. Essa integracao pode ser adicionada depois com o provedor oficial do projeto.

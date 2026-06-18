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

O watchdog envia alerta por e-mail via API HTTP da Resend usando `fetch`, sem dependencia nova.

Variaveis esperadas:

- `RESEND_API_KEY`
- `WATCHDOG_ALERT_EMAIL`
- `WATCHDOG_ALERT_FROM` opcional; se ausente, o script tenta `EMAIL_FROM` e depois usa o remetente padrao de teste da Resend.
- `WATCHDOG_ALERT_COOLDOWN_HOURS` opcional; padrao: `12`.

Configure essas variaveis manualmente no ambiente local/servidor. Nao inclua secrets em commits.

O e-mail e enviado somente quando o status geral for `warning` ou `critical`. Quando o status for `ok`, o bloco `emailAlert` do JSON informa que o alerta foi pulado.

Para testar envio mesmo com status `ok`:

```powershell
npm.cmd run watchdog:supabase-r2 -- --test-email
```

No modo de teste, o assunto e:

```text
[EntreUS Watchdog] Teste de alerta
```

O teste ignora cooldown.

## Cooldown

Para evitar spam, o watchdog grava estado local em:

- `reports/supabase-r2-watchdog-alert-state.json`

O fingerprint do alerta usa:

- status geral;
- candidatos Supabase Storage;
- quantidade de warnings;
- status de saude do Supabase;
- R2 completo/incompleto.

Se o mesmo alerta ja foi enviado dentro do cooldown, o script nao envia novamente e registra o motivo em `emailAlert`.

## Conteudo do E-mail

O e-mail contem apenas um resumo operacional:

- status geral;
- data/hora;
- saude do Supabase;
- candidatos Supabase Storage;
- referencias R2;
- URLs externas;
- local public;
- warnings;
- acao recomendada;
- caminhos locais dos relatorios JSON e Markdown.

O e-mail nao inclui secrets, signed URLs ou listas completas de URLs. O relatorio JSON mascara o e-mail de destino.

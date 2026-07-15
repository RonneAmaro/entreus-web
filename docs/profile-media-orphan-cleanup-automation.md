# Automacao do dry run de midias orfas de perfil

## Estado atual

As migrations `20260714_create_profile_media_cleanup_runs.sql` e `20260715_tighten_profile_media_cleanup_runs_privileges.sql` foram aplicadas manualmente no Supabase. RLS, RPCs, indice de lock e privilegios foram validados: `anon` e `authenticated` nao acessam a tabela nem as RPCs; `service_role` tem somente `SELECT`, `INSERT` e `UPDATE` na tabela e `EXECUTE` nas duas RPCs, sem `DELETE`, `TRUNCATE`, `REFERENCES` ou `TRIGGER`.

`CRON_SECRET` esta configurado como variavel Sensitive somente no ambiente Production da Vercel. O `vercel.json` ainda nao foi implantado, o cron ainda nao executou em producao e nenhuma exclusao real de objetos foi realizada. A presenca do arquivo no repositorio nao comprova implantacao nem execucao.

## Arquitetura, agenda e autenticacao

O `vercel.json` agenda diariamente `GET /api/internal/cron/profile-media-orphan-dry-run` para `03:30 UTC`. O horario e nominal e a plataforma pode iniciar a chamada dentro da janela permitida pelo plano. O deploy deve ocorrer somente depois do commit e da revisao humana.

A Vercel envia `Authorization: Bearer <CRON_SECRET>`. A rota exige o formato estrito, segredo configurado com pelo menos 32 caracteres e comparacao por digest com `timingSafeEqual`. Configuracao ausente ou invalida falha fechada. A rota nao usa sessao, usuario ou papel do navegador, e body, query string e headers nao configuram modo ou limite.

O executor passa internamente `dryRun: true` e lote 10. Ele nao oferece opcao destrutiva, nao chama helper de exclusao e nao altera permanentemente status ou tentativas da fila. O dry run pode executar HEAD e validacoes no banco, mas nunca DeleteObject. Nenhuma exclusao automatica esta autorizada por este pacote.

## Historico, lock e recuperacao

`profile_media_cleanup_runs` armazena somente identificadores do job/run, modo, origem, estado, timestamps, duracao, contadores e codigo de erro sanitizado. Nao armazena storage key, URL, bucket, endpoint, segredo, payload ou stack trace. Respostas e logs tambem ficam limitados a estados, identificadores operacionais, duracao, contadores e codigos neutros.

A linha em estado `started`, protegida por indice unico parcial e lock transacional na RPC de inicio, impede dois dry runs simultaneos. Uma execucao presa expira depois de aproximadamente 30 minutos e passa a `expired`. Falha ao registrar o inicio impede a consulta da fila. Falha ao registrar a conclusao retorna erro e deixa o lock ativo ate a recuperacao, impedindo repeticao imediata do mesmo dry run.

## Operacao e primeira verificacao em producao

Depois do commit, revisao e deploy, confirme no painel da Vercel que o cron foi criado com a rota e agenda esperadas. Apos a primeira janela:

1. confirme a invocacao e o status HTTP nos logs da Vercel, sem copiar headers;
2. consulte no Supabase somente as colunas de `profile_media_cleanup_runs` e confirme uma linha `succeeded` ou um codigo sanitizado;
3. confira lote no maximo 10, contadores nao negativos e duracao nao negativa;
4. confirme que fila, `attempt_count` e objetos permaneceram inalterados;
5. se a fila estiver vazia, registre que o caminho HEAD de um objeto real nao foi exercitado.

Logs nao devem incluir chaves, URLs, bucket, endpoint, headers, credenciais ou mensagens brutas. Sinais para alerta futuro incluem falhas consecutivas, `configuration_error`, job `expired`, `wouldDelete > 0`, `failedValidation > 0` ou duracao anormal.

## Desativacao e rollback

Para desativar novas chamadas, remova a entrada de `crons` do `vercel.json`, submeta a alteracao a revisao e publique uma nova revisao. Para bloquear a automacao imediatamente no banco, revogue `EXECUTE` das RPCs para `service_role`. Preserve tabela e linhas de historico para auditoria; remover a tabela apaga evidencia operacional. A remocao do segredo pode ser usada como defesa adicional e faz a rota falhar fechada.

## Limitacoes e riscos residuais

O cron ainda nao foi validado em producao. Uma fila vazia nao exercita HEAD para objeto real. Permanecem riscos de atraso ou ausencia de invocacao pela plataforma, configuracao incorreta, indisponibilidade do Supabase ou R2 e lock mantido ate a expiracao se a conclusao falhar.

Nenhuma exclusao automatica esta autorizada. Qualquer ativacao destrutiva exige pacote separado, testes especificos e aprovacao humana explicita.

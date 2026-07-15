# Limpeza segura de midias orfas de perfil

## Origem e objetivo

Um orfao e registrado quando a copia privada para `profile-media/public/` termina, mas a RPC de aprovacao falha. O objeto nao esta confirmado como avatar ou capa e nao deve ser removido imediatamente. Este processo aplica retencao, revalidacao no banco, exclusao R2 confirmada e historico minimo. Nao e um coletor generico: processa exclusivamente linhas de `profile_media_copy_orphans`, provider R2 e chaves relativas de midia publica de perfil.

## Estados

- `pending`: aguardando retencao.
- `processing`: reivindicado por um job.
- `retry`: falha temporaria, aguardando backoff.
- `deleted`: DeleteObject confirmado por HEAD ausente.
- `not_found`: objeto ja estava ausente.
- `protected`: chave invalida ou possivelmente em uso.
- `failed`: cinco tentativas sem sucesso.
- `cancelled`: retirado manualmente sem excluir o objeto.

RLS permanece habilitada e nao ha policies para `anon` ou `authenticated`. Claim e finalizacao sao RPCs exclusivas de `service_role`.

## Retencao, concorrencia e recuperacao

O fallback e 24 horas. `PROFILE_MEDIA_ORPHAN_RETENTION_HOURS` aceita inteiros entre 1 e 720; valores ausentes, zero, negativos ou invalidos voltam para 24. A janela protege contra concorrencia administrativa, consistencia eventual, investigacao e recuperacao manual.

`claim_profile_media_copy_orphans` limita lotes a 50, seleciona apenas `pending` e `retry` elegiveis e usa `FOR UPDATE SKIP LOCKED`. Dois workers nao recebem a mesma linha. Claims `processing` com mais de 30 minutos voltam para `retry` (ou `failed` no limite), sem excluir objetos.

## Validacoes antes de excluir

O parser aceita exclusivamente `profile-media/public/<user-uuid>/<object-uuid>.(jpg|png|webp)`, com UUID canonico, UUID v4 para o objeto e exatamente dois segmentos depois do prefixo. Ele bloqueia chaves vazias, segmentos extras, encoding ambiguo, URLs completas, query, fragmento, `..`, barra invertida, controles, `protected/` e outras extensoes. Antes do R2, o executor verifica submissao aprovada com a chave, submissao associada pendente/aprovada e URL exata usada em `profiles.avatar_url` ou `banner_url`.

A chave e extraida somente de URL HTTPS pertencente a `R2_PUBLIC_BASE_URL`, por origem e caminho exatos. Nao ha comparacao por substring. Em duvida ou falha da verificacao, nada e apagado.

## R2, confirmacao e retry

O fluxo real executa HEAD, valida MIME JPEG/PNG/WebP e tamanho positivo, envia DeleteObject e executa novo HEAD. Ausencia inicial vira `not_found`; ausencia apos DeleteObject vira `deleted`. Objeto ainda presente, acesso negado ou falha temporaria usam backoff de 15 minutos, 1 hora, 6 horas e 24 horas. Na quinta tentativa o registro vira `failed`. Configuracao ausente interrompe o lote antes do claim.

Logs e respostas nunca incluem chave, bucket, endpoint, credenciais ou URL. O resumo contem apenas contadores.

## Dry run e execucao manual

Dry run e o padrao. A RPC consulta sem mudar status ou tentativa; o executor revalida banco e HEAD, mas nunca chama DeleteObject nem finaliza a linha. O resumo separa `wouldDelete`, `notFound`, `protected` e `failedValidation`, evitando que um objeto seguro apareca apenas como reivindicado.

Com a aplicacao rodando e `PROFILE_MEDIA_CLEANUP_SECRET` configurado com pelo menos 32 caracteres:

```powershell
$env:PROFILE_MEDIA_CLEANUP_SECRET = "<segredo>"
$env:PROFILE_MEDIA_CLEANUP_URL = "https://dominio/api/internal/profile-media-orphan-cleanup"
npm.cmd run cleanup:profile-media-orphans -- --dry-run --limit=10
npm.cmd run cleanup:profile-media-orphans -- --execute --limit=10
```

O script nao carrega `.env.local`: recebe somente as duas variaveis acima pelo ambiente do processo. A URL exige HTTPS, exceto HTTP para localhost/127.0.0.1/[::1], sem credenciais, query ou hash e com o caminho interno exato. Assim o segredo nunca e enviado por HTTP remoto. A rota usa segredo proprio e comparacao por digest com `timingSafeEqual`; nao aceita service role, chave R2 ou login admin como segredo. O modo destrutivo exige `--execute`.

O dry run diario automatizado usa uma rota GET exclusiva e nunca chama o modo destrutivo desta rota manual. Consulte [Automacao do dry run de midias orfas de perfil](./profile-media-orphan-cleanup-automation.md) para agenda, autenticacao, lock, migration manual, operacao e rollback.

## Migration, rollback e riscos

Aplicar manualmente `20260712_harden_profile_media_orphan_cleanup.sql` somente apos revisao. Para rollback, interromper workers, revogar RPCs e preservar tabela/historico. Remover colunas de auditoria apaga evidencia operacional e nao e recomendado. A migration anterior nao e alterada.

O risco residual principal e configuracao incorreta do dominio publico ou permissao R2. A politica e fail-closed: falha de configuracao interrompe; falha de validacao protege/reagenda.

## Teste manual controlado

1. Criar orfao com objeto descartavel em ambiente de teste.
2. Confirmar que registro novo nao e reivindicado antes da retencao.
3. Executar dry run e confirmar que o objeto permanece.
4. Tornar o registro elegivel e executar lote real com limite 1.
5. Confirmar DeleteObject, HEAD ausente e status `deleted`.
6. Repetir com objeto inexistente e confirmar `not_found`.
7. Associar objeto descartavel a avatar/capa e confirmar `protected`.
8. Simular falha temporaria e confirmar `retry` e `next_attempt_at`.
9. Simular worker interrompido e confirmar recuperacao do claim.
10. Confirmar ausencia de chaves, bucket, segredo e URL em resposta/logs.

Nunca usar objetos reais de usuarios nesse teste.

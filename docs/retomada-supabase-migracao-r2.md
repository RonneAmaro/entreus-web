# Retomada do Supabase e migracao segura para R2

## Objetivo

Este guia registra o caminho seguro para retomar o Supabase quando ele voltar a ficar disponivel e preparar a migracao gradual de midias para Cloudflare R2.

O objetivo principal e reduzir o risco de novo estouro de egress/storage no Supabase, mantendo o R2 como destino principal para novas midias e tratando o historico com auditoria, copia e validacao antes de qualquer limpeza.

## O que aconteceu

O Supabase pode ficar pausado, restrito ou instavel por limite de egress/cached egress. Mesmo depois de novos uploads passarem a usar R2, midias antigas, URLs publicas e acessos a arquivos ainda salvos no Supabase Storage podem continuar consumindo banda.

Por isso, a retomada nao deve ser tratada apenas como "o servico voltou". E necessario auditar onde ainda existem URLs/caminhos antigos, copiar o que for necessario para R2 e atualizar referencias com controle.

## Regra de ouro

Nao apagar nada no inicio.

A ordem segura e:

1. Auditar.
2. Copiar.
3. Atualizar referencias.
4. Testar.
5. Confirmar estabilidade.
6. Planejar limpeza apenas depois de backup e janela de observacao.

## Checklist quando o Supabase liberar

### A. Dashboard Supabase

- Entrar no dashboard do Supabase.
- Confirmar que o projeto esta ativo, sem pausa ou restricao.
- Usar Resume/Restore se o dashboard solicitar.
- Conferir Usage/Billing antes de reativar fluxos pesados.
- Confirmar que Auth responde.
- Confirmar que o banco responde.
- Nao iniciar migracao se o dashboard ainda indicar limite, bloqueio ou instabilidade.

### B. Projeto local

Rodar no projeto:

```powershell
cd C:\Porjetos\EntreUS\entreus-web
git status --short
npm.cmd run build
```

Se houver alteracoes locais, registrar quais sao antes de iniciar qualquer pacote novo.

### C. Dry-run de auditoria

Rodar:

```powershell
npm.cmd run media:migration:dry-run
```

Esse comando deve ser usado apenas como auditoria. Ele nao deve atualizar banco, copiar arquivos, apagar objetos ou alterar referencias.

### D. Se der erro

- Registrar a mensagem de erro sem expor secrets.
- Nao contornar validacoes.
- Nao trocar variaveis sensiveis no improviso.
- Tentar novamente mais tarde, se parecer indisponibilidade temporaria.
- Se persistir no dia seguinte, avaliar Billing, limite temporario ou upgrade de plano antes de rodar novas rotinas.

### E. Se funcionar

- Salvar o relatorio gerado.
- Identificar tabelas e campos com URLs antigas.
- Separar resultados por categoria: posts/feed, perfis, mensagens, Meet e arquivos sensiveis.
- Definir uma amostra pequena para validacao manual antes de qualquer migracao real.

## Onde procurar midias antigas

- `posts.image_url`
- `posts.video_url`
- `post_media.media_url`
- `comment_media.media_url`
- `profiles.avatar_url`
- `profiles.banner_url`
- anexos de mensagens privadas
- anexos de Meet
- arquivos de verificacao de idade, sempre com cuidado especial
- qualquer campo contendo `supabase.co/storage`
- qualquer campo contendo `/storage/v1/object`

## Ordem segura de migracao

1. Posts, feed e comentarios publicos.
2. Avatares e banners de perfil.
3. Mensagens e anexos privados.
4. Meet e anexos de salas.
5. Verificacoes 18+ e arquivos sensiveis, somente com plano proprio de privacidade, retencao e auditoria.

## O que nao fazer

- Nao deletar buckets, pastas ou arquivos antigos antes de confirmar a migracao.
- Nao executar update SQL em massa sem backup e relatorio.
- Nao commitar `.env.local`, service role key, tokens ou secrets.
- Nao imprimir service role key, signed URL completa ou segredo em logs.
- Nao migrar arquivos 18+ junto com midias publicas.
- Nao alterar URLs manualmente sem script, relatorio e validacao.
- Nao assumir que uma URL R2 valida significa que todas as telas foram testadas.

## Comandos uteis

```powershell
git status --short
npm.cmd run build
npm.cmd run media:migration:dry-run
git diff --stat
git log --oneline -10
```

## Sinais de sucesso

- Auth funciona no app.
- Feed carrega sem erros.
- Midias antigas de posts abrem corretamente.
- Novos uploads continuam indo para R2.
- Dry-run termina sem erro.
- Consumo do Supabase deixa de crescer por midias publicas.
- Objetos novos aparecem no R2.

## Proximos pacotes sugeridos

- Pacote 22: auditoria real com Supabase liberado.
- Pacote 23: copia segura Supabase Storage -> R2 sem apagar origem.
- Pacote 24: atualizacao controlada de referencias no banco.
- Pacote 25: validacao visual de posts antigos.
- Pacote 26: limpeza planejada do Supabase Storage, somente depois de backup e testes.

## Checklist final antes de migracao real

- Backup/export do banco feito.
- Relatorio do dry-run salvo.
- Amostra pequena testada.
- CORS do R2 confirmado.
- Novos uploads confirmados no R2.
- Plano de rollback definido.
- Nenhum segredo exposto em logs, commits ou documentos.

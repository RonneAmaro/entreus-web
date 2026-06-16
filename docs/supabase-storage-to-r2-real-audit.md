# Auditoria real Supabase Storage -> Cloudflare R2

Data/hora da auditoria: 2026-06-16 17:15 America/Manaus / 2026-06-16 21:15 UTC.

## Estado do Supabase

Status: ainda restrito.

O Supabase respondeu ao dry-run, mas recusou as consultas por limite de cached egress. O erro seguro retornado foi:

```text
Service for this project is restricted due to the following violations: exceed_cached_egress_quota.
```

Nenhum secret, token, URL assinada ou dado sensivel foi exposto neste relatorio.

## Resultado do comando

Comando executado:

```powershell
npm.cmd run media:migration:dry-run
```

Resultado resumido:

- Total analisado: 0.
- Candidatos Supabase Storage: 0.
- Ja em R2: 0.
- Externos: 0.
- Warnings: 4.
- Relatorio local gerado: `reports/media-migration-dry-run.json`.

Observacao importante: os zeros acima nao significam ausencia de midias antigas. Como o Supabase ainda esta restrito, todas as fontes foram ignoradas e a auditoria real de dados nao aconteceu.

## Areas com possiveis referencias antigas

A auditoria nao conseguiu consultar as tabelas. As areas abaixo continuam como possiveis fontes de referencias antigas, com base na auditoria tecnica anterior:

- Posts/feed: `posts.image_url`, `posts.video_url`, `post_media.media_url`, `comment_media.media_url`.
- Perfis: `profiles.avatar_url`, `profiles.banner_url`.
- Mensagens/anexos: caminhos de anexos privados em Supabase Storage.
- Meet/anexos: caminhos de anexos privados em Supabase Storage.
- Verificacao 18+: documentos e selfies, apenas com auditoria segura e sem expor dados.
- Outros: qualquer campo contendo `supabase.co/storage` ou `/storage/v1/object`.

## Contagens aproximadas

Nao ha contagens confiaveis neste pacote porque o Supabase bloqueou as consultas.

Contagem observada pelo dry-run:

| Area | Itens analisados | Candidatos Supabase Storage | Observacao |
|---|---:|---:|---|
| Posts/feed | 0 | 0 | Consulta bloqueada por restricao de cached egress |
| Perfis | 0 | 0 | Nao coberto pelo script atual nesta execucao |
| Mensagens/anexos | 0 | 0 | Nao coberto pelo script atual nesta execucao |
| Meet/anexos | 0 | 0 | Nao coberto pelo script atual nesta execucao |
| Verificacao 18+ | 0 | 0 | Nao coberto pelo script atual nesta execucao |
| Outros | 0 | 0 | Nao auditado |

## Exemplos mascarados ou seguros

Nao foram coletados exemplos de URLs ou caminhos porque as consultas foram bloqueadas.

## Riscos encontrados

- O Supabase ainda esta restrito por `exceed_cached_egress_quota`.
- A auditoria real nao pode confirmar quais midias antigas ainda apontam para Supabase Storage.
- O script atual audita apenas midias publicas principais de posts e comentarios; perfis, mensagens, Meet e arquivos sensiveis ainda precisam de cobertura em pacote futuro, sempre em modo dry-run.
- Nao se deve iniciar copia, migracao ou limpeza sem uma auditoria bem-sucedida.

## O que ainda precisa ser migrado

A confirmar depois que o Supabase liberar as consultas:

- Midias publicas antigas de posts e comentarios que ainda usem Supabase Storage.
- Avatares e banners de perfil que ainda usem Supabase Storage.
- Anexos privados de mensagens, se a estrategia futura definir migracao para R2 privado.
- Anexos de Meet, se a estrategia futura definir migracao para R2 privado.
- Arquivos sensiveis de verificacao 18+ somente com plano proprio de privacidade, retencao e auditoria.

## O que NAO deve ser apagado

- Nenhum bucket do Supabase.
- Nenhum arquivo antigo do Supabase Storage.
- Nenhum objeto do R2.
- Nenhuma referencia no banco.
- Nenhum dado sensivel.
- Nenhum relatorio local antes de revisar se contem apenas dados seguros.

## Proximo pacote recomendado

Antes do Pacote 23, resolver a restricao do Supabase no dashboard/Billing e repetir o Pacote 22 ate o dry-run consultar dados reais.

Quando o Supabase estiver acessivel, o proximo pacote deve:

1. Rodar novamente `npm.cmd run media:migration:dry-run`.
2. Confirmar contagens reais de posts/feed.
3. Ampliar o dry-run, se necessario, para perfis e anexos sem alterar dados.
4. Atualizar este relatorio com contagens e exemplos mascarados.

Somente depois de uma auditoria real bem-sucedida deve ser planejado o Pacote 23 de copia segura Supabase Storage -> R2 sem apagar origem.

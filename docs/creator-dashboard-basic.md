# Dashboard básico do Criador

`/creator-dashboard` é um painel privado do usuário autenticado. Ele consolida sinais já existentes no EntreUS sem criar uma camada financeira nova, sem buscar mídia e sem expor conteúdo ou dados de outros criadores.

## Métricas reais neste pacote

- Posts do próprio criador, por comunidade e classificação (`safe`, `sensitive`, `adult_18plus`).
- Curtidas, comentários, reposts e salvos recebidos por posts próprios, quando a leitura das tabelas responder.
- Total de seguidores via `follows.following_id`.
- Última atividade, posts recentes e posts com mais interações, calculados apenas com identificador, data, classificação e contagens.
- Posts com status de moderação diferente de `active`, quando esse campo estiver disponível.
- Apoios em ItaCash já registrados como `itacash_transactions.type = tip_received` e saldo da própria carteira, ambos somente leitura.

Cada fonte opcional tem fallback seguro: se a consulta falhar, o painel mostra “Em preparação” ou indisponível, em vez de inventar um número. O cálculo percentual de engajamento exige uma fonte real de visualizações; como não há tabela de analytics confirmada neste schema, permanece explicitamente em preparação.

## Segurança e consultas

As consultas usam a sessão atual e limitam os dados a:

- `posts.user_id = auth.uid()`;
- interações filtradas pelos IDs desses posts;
- `follows.following_id = auth.uid()`;
- carteira e transações de ItaCash do próprio usuário.

O painel não busca texto do post, imagens, vídeos, URLs assinadas, chaves de storage ou mídia protegida. Conteúdo adulto próprio aparece apenas como classificação agregada; conteúdo de terceiros nunca é carregado pelo dashboard.

## Monetização

O painel exibe o saldo atual da carteira ItaCash apenas para referência e informa que ele não representa um saldo de saque. Não cria gorjetas, posts pagos, assinaturas, compras, aprovações, transferências ou solicitações de saque.

Itens preparados para pacotes futuros:

- gorjetas com ItaCash voltadas a criadores;
- posts pagos;
- solicitação de saque manual, com regras e revisão próprias;
- analytics de visualização e engajamento percentual;
- dashboard avançado e programa de criadores fundadores.

## Testes

`tests/unit/creator-dashboard.test.ts` cobre cálculo de engajamento com zero visualizações, fallback de métricas ausentes, agregação por comunidade e classificação, moderação e ordenação segura de posts. O smoke E2E inclui a rota protegida do dashboard e aceita redirecionamento para login sem depender de conta real.

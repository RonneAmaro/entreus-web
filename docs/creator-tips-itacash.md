# Gorjetas ItaCash para criadores

Este pacote habilita gorjetas em ItaCash entre usuarios autenticados. ItaCash e credito interno da plataforma EntreUS: nao e cripto, nao e moeda financeira externa e nao cria saque automatico.

## Como funciona

- O usuario escolhe um criador no perfil publico ou em um post.
- A UI abre o modal "Enviar gorjeta" com valores rapidos de 10, 25, 50 e 100 ItaCash, alem de valor personalizado inteiro.
- O client envia a solicitacao para `POST /api/creator-tips` com token Supabase do usuario logado.
- A rota valida payload, autenticacao, criador real, self-tip e post opcional.
- A transferencia e feita pela RPC existente `public.send_itacash_tip(p_receiver_id uuid, p_amount integer, p_message text)`.

## Tabelas e RPCs reaproveitadas

- `itacash_wallets`: saldo interno por usuario.
- `itacash_transactions`: historico com `tip_sent` para remetente e `tip_received` para recebedor.
- `notifications`: a RPC existente registra notificacao `tip_received`.
- `public.send_itacash_tip`: RPC `security definer` ja preparada nas migrations para debitar, creditar, registrar transacoes e impedir saldo insuficiente.

## Protecoes

- O remetente vem da sessao autenticada, nunca do payload.
- Valor precisa ser inteiro e positivo.
- Gorjeta para si mesmo e bloqueada no helper, na rota e na RPC.
- A rota valida se o criador existe em `profiles`.
- Quando `postId` e enviado, a rota valida se o post pertence ao criador.
- Posts 18+ bloqueados para a conta do usuario nao podem ser usados como origem da gorjeta.
- Saldo negativo e bloqueado pela RPC e pela constraint da carteira.
- Service role nao e exposto ao client.

## Dashboard do criador

`/creator-dashboard` continua lendo apenas dados do proprio usuario. O painel mostra:

- total recebido em gorjetas ItaCash;
- quantidade de apoios recebidos;
- ultimos apoios registrados em `itacash_transactions`;
- estado vazio quando ainda nao ha apoios.

Se a leitura de `itacash_transactions` falhar por RLS ou schema ausente, o painel usa fallback seguro e mostra indisponibilidade sem expor detalhes tecnicos.

## Limitacoes atuais

- O schema reaproveitado nao grava `post_id` estruturado na transacao da gorjeta. A rota valida o post quando informado, mas a RPC atual registra apenas a transferencia e a mensagem.
- Nao ha saque real ou automatico.
- A taxa de plataforma 85/15 e documentada em `docs/itacash-revenue-split.md`.
- Nao ha extrato financeiro completo do criador neste pacote.

## Proximos passos

- Solicitacao de saque manual.
- Posts pagos ou desbloqueaveis.
- Notificacoes de gorjeta com contexto de post.
- Extrato financeiro do criador.
- Taxa da plataforma.
- Auditoria dedicada de RLS para monetizacao.

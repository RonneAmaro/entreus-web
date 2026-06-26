# Saque manual de criadores

Pacote 40 prepara a solicitacao de saque manual para criadores. Ele nao faz pagamento automatico, nao integra Pix automatico e nao altera Mercado Pago, webhooks, compra de ItaCash ou aprovacao de compra.

## Regras

- Conversao: 10 ItaCash = R$ 1,00.
- Saque minimo: R$ 100,00.
- Saque minimo em ItaCash: 1000 ItaCash.
- O criador precisa estar autenticado.
- A validacao final acontece na RPC do banco.
- O saldo e debitado no momento da solicitacao para impedir gasto duplo.
- Se o admin recusar, o valor e estornado para a carteira.
- Se o admin marcar como pago, o saldo nao e debitado de novo.

## Fluxo

1. O criador solicita o saque no painel do criador.
2. A RPC `request_creator_withdrawal` bloqueia a carteira com `FOR UPDATE`, valida saldo e debita o valor.
3. O admin paga o Pix manualmente fora da plataforma.
4. O admin marca a solicitacao como paga no painel admin.
5. Se o admin recusar, a RPC `reject_creator_withdrawal` devolve o ItaCash para a carteira.

## Estrutura criada

- Tabela: `public.creator_withdrawal_requests`.
- RPCs:
  - `public.request_creator_withdrawal(integer, text, text, text)`
  - `public.reject_creator_withdrawal(uuid, text)`
  - `public.mark_creator_withdrawal_paid(uuid, text)`
- APIs:
  - `GET /api/creator-withdrawals`
  - `POST /api/creator-withdrawals`
  - `GET /api/admin/creator-withdrawals`
  - `PATCH /api/admin/creator-withdrawals/[id]`
- Tipos de transacao ItaCash:
  - `withdrawal_requested`
  - `withdrawal_refunded`
- Tipos de notificacao:
  - `withdrawal_requested`
  - `withdrawal_paid`
  - `withdrawal_rejected`

## Como aplicar a migration

A migration foi criada em:

`supabase/migrations/20260626_create_creator_withdrawal_requests.sql`

Revise o SQL e aplique manualmente no Supabase. Nao ha aplicacao automatica pelo pacote.

## Como testar

1. Rodar `npm.cmd run test:unit`.
2. Rodar `npm.cmd run build`.
3. Aplicar a migration manualmente em ambiente de teste.
4. Entrar como criador com pelo menos 1000 ItaCash.
5. Solicitar saque no `/creator-dashboard`.
6. Entrar como admin em `/admin/creator-withdrawals`.
7. Marcar como pago ou recusar.
8. Conferir `/wallet` para `Saque solicitado` e, em caso de recusa, `Saque estornado`.

## Limitacoes

- O pagamento Pix e feito fora da plataforma.
- Nao ha comprovante de pagamento neste pacote.
- Nao ha exportacao financeira.
- Nao ha taxa da plataforma aplicada ao saque.
- Nao ha KYC/compliance automatizado.

## Proximos passos

- Comprovante de pagamento.
- Exportacao administrativa.
- Taxa da plataforma.
- Saque automatico futuro.
- KYC/compliance.

# Saques manuais de criadores

Este fluxo permite que criadores solicitem saque manual de ItaCash. Ele nao executa pagamento automatico, nao integra Pix automatico, nao usa BRICS Pay, nao usa Open Finance e nao chama servico externo.

## Regras

- Saque minimo: 1000 ItaCash.
- Conversao exibida: 10 ItaCash = R$ 1,00.
- Portanto, 1000 ItaCash = R$ 100,00.
- O criador precisa estar autenticado.
- A validacao final acontece no backend e na RPC do Supabase.
- O saldo e debitado no momento da solicitacao para reduzir risco de gasto duplo.
- Se o admin recusar, a RPC estorna o ItaCash para a carteira.
- Se o admin marcar como pago, o saldo nao muda novamente.

## Metodos disponiveis

- Pix: metodo recomendado no Brasil.
- Transferencia bancaria nacional: pagamento manual com dados bancarios basicos.
- Internacional/manual em analise: opcao futura/manual, sem promessa de disponibilidade automatica.
- Outro/manual: metodo descrito pelo criador para conferencia da equipe.

## Dados por metodo

Pix:

- tipo da chave Pix;
- chave Pix;
- nome do titular.

Transferencia bancaria:

- nome do titular;
- CPF/CNPJ do titular;
- banco;
- agencia;
- conta;
- tipo de conta;
- observacao opcional.

Internacional/manual:

- nome do titular;
- pais;
- metodo desejado;
- observacoes.

Outro/manual:

- nome do titular;
- descricao do metodo;
- observacoes.

## Fluxo do criador

1. O criador abre `/creator-dashboard`.
2. O painel mostra saldo disponivel, saque minimo, conversao aproximada em reais e historico.
3. O criador informa valor, metodo de recebimento e dados do titular.
4. A API valida metodo, detalhes, valor minimo e formato basico.
5. A RPC bloqueia a carteira, valida saldo e registra a solicitacao.
6. O historico mostra valor, metodo, data e status.

## Fluxo do admin

1. O admin abre `/admin/creator-withdrawals`.
2. A lista mostra criador, valor em ItaCash, equivalente em reais, metodo, resumo, data e status.
3. O card mostra os dados completos necessarios para o pagamento manual.
4. O admin paga fora da plataforma.
5. O admin registra uma das acoes disponiveis: em analise, aprovado, pago ou recusado.
6. Ao recusar, o admin informa o motivo para o criador.

## Status

- `pending`: solicitacao enviada e aguardando analise.
- `reviewing`: admin marcou em analise.
- `approved`: admin aprovou para pagamento manual.
- `paid`: admin pagou fora da plataforma e registrou como pago.
- `rejected`: admin recusou e o valor foi estornado.
- `cancelled`: reservado para cancelamentos.

## Contador de pendentes

O painel `/admin` inclui saques pendentes no resumo de pendencias e mostra uma badge discreta no card de saques de criadores. O contador usa a quantidade atual de registros `pending` e nao dispara pagamento, toast invasivo ou notificacao repetida.

## Privacidade

- O criador ve seus proprios dados de recebimento no historico.
- Admins veem os dados necessarios para pagamento manual.
- Listagens devem preferir resumo do metodo; dados completos ficam restritos ao contexto admin ou ao proprio criador.
- Dados sensiveis de recebimento nao devem ser registrados em console.

## Banco e migration

A migration do Pacote 42 foi criada em:

`supabase/migrations/20260709_improve_creator_withdrawals_manual_methods.sql`

Ela adiciona `payment_method` e `payment_details`, amplia status para `reviewing` e `approved`, preserva a RPC legada de Pix e cria RPCs para marcar em analise e aprovar. A migration deve ser revisada e aplicada manualmente no Supabase.

## Limitacoes

- Nao ha pagamento automatico.
- Nao ha integracao Pix automatica.
- Nao ha integracao BRICS Pay.
- Nao ha saque internacional automatico.
- Nao ha comprovante de pagamento neste pacote.
- Integracoes externas ficam para pacote futuro.

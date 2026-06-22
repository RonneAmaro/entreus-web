# Fluxo de pagamento VIP

## Caminho de compra

1. Em `/vip-plus`, a pessoa escolhe um plano e usa **Pagar com Mercado Pago**.
2. O servidor cria o pedido `vip_plus` em `payment_orders`, cria a preferência do Mercado Pago e associa a preferência ao pedido.
3. A API devolve somente a URL HTTPS de checkout (`checkout_url`); nenhum access token do Mercado Pago é enviado ao navegador.
4. A página abre o checkout. Caso exista um pedido pendente com URL válida, o botão passa a ser **Continuar pagamento**.
5. Criar um pedido pendente não ativa VIP.

O retorno do navegador (`?payment=success`, `pending` ou `failure`) apenas informa o estado conhecido. Ele não concede VIP. A confirmação final depende da notificação do Mercado Pago e da consulta server-side do pagamento.

## Webhook e idempotência

O webhook busca o pagamento diretamente no Mercado Pago. Para pedidos VIP aprovados, ele valida moeda BRL, valor total, plano, preferência quando disponível e o método de pagamento. A RPC `complete_mercadopago_payment_order_v2` bloqueia o pedido e usa `processed_at` para impedir que notificações repetidas estendam ou ativem o VIP duas vezes.

Depois da aprovação válida, a RPC marca o pedido como pago, ativa o perfil pelo período do plano, atualiza a origem VIP para pagamento e concede o selo VIP quando ele ainda não existe. Pagamentos pendentes, recusados, com valor/plano divergente ou Pix manual não ativam VIP automaticamente.

## Pix manual

**Ver Pix manual** consulta somente as instruções configuradas pelo servidor. A tela não pede CPF, RG nem dados bancários da pessoa. Pix manual fica explicitamente sujeito à confirmação pela equipe; não chama fluxo de ativação automática.

Se não houver `PIX_KEY` nem `PIX_PAYMENT_LINK`, a opção informa que o Pix manual está indisponível.

## Configuração e teste

Configure, sem expor valores no cliente:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET` (recomendado)
- `NEXT_PUBLIC_SITE_URL`, com URL pública HTTPS para callbacks
- `PIX_KEY`, `PIX_PAYMENT_LINK`, `PIX_RECEIVER_NAME` e `PIX_RECEIVER_CITY` apenas se o Pix manual for oferecido

Em sandbox/local, use uma URL pública HTTPS para o webhook. Checklist manual:

1. Criar um pedido VIP e confirmar que o checkout abre.
2. Confirmar que um pedido pendente não altera o perfil para VIP.
3. Receber ou simular uma notificação aprovada com dados compatíveis.
4. Confirmar `vip_status = active`, a expiração correta e o selo VIP.
5. Reenviar a mesma notificação e confirmar que a data de expiração não é duplicada.

export const PAYMENT_ERROR_MESSAGES = {
  payment_urls_not_configured: 'Configure URLs públicas HTTPS para os pagamentos do Mercado Pago.',
  payment_configuration_missing: 'Os pagamentos do Mercado Pago não estão configurados neste ambiente.',
  payment_order_creation_failed: 'Não foi possível preparar o pedido agora. Tente novamente em instantes.',
  payment_provider_rejected: 'O Mercado Pago recusou a solicitação. Tente novamente em instantes.',
  payment_session_expired: 'Sua sessão expirou. Entre novamente para continuar.',
  payment_temporary_error: 'O pagamento está temporariamente indisponível. Tente novamente em instantes.',
  authentication_required: 'Entre na sua conta para continuar.',
  session_refresh_failed: 'Não foi possível renovar sua sessão. Entre novamente para continuar.',
  authentication_rejected: 'Sua autenticação foi rejeitada. Entre novamente para continuar.',
  temporary_payment_error: 'O pagamento está temporariamente indisponível. Tente novamente em instantes.',
  pix_configuration_missing: 'A configuração do Pix manual está incompleta.',
  pix_key_invalid: 'A chave Pix configurada não é válida.',
  pix_receiver_invalid: 'Os dados do recebedor do Pix não são válidos.',
  pix_amount_invalid: 'O valor do Pix não é válido.',
  pix_generation_failed: 'Não foi possível gerar o Pix agora. Tente novamente em instantes.',
  temporary_pix_error: 'O Pix está temporariamente indisponível. Tente novamente em instantes.',
} as const
export type PaymentErrorCode = keyof typeof PAYMENT_ERROR_MESSAGES
export function paymentError(code: PaymentErrorCode) { return { error: PAYMENT_ERROR_MESSAGES[code], code } }

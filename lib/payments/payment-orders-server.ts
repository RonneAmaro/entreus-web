import 'server-only'

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export type TrustedPaymentOrder = {
  id: string
  external_reference: string
  product_id: string | null
  product_type: 'itacash' | 'vip_plus'
  status: string
  amount_itacash: number | null
  base_amount_brl_cents: number
  platform_fee_brl_cents: number
  operator_fee_brl_cents: number
  total_brl_cents: number
  metadata: Record<string, unknown> | null
  provider_init_point?: string | null
  created_at?: string
}

type CreateTrustedPaymentOrderInput = {
  userId: string
  productType: TrustedPaymentOrder['product_type']
  productId: string | null
  amountItacash: number | null
  baseAmountBrlCents: number
  platformFeePercent: number
  platformFeeBrlCents: number
  operatorFeePercent: number
  operatorFeeBrlCents: number
  totalBrlCents: number
  metadata: Record<string, unknown>
}

type AttachPixInput = {
  orderId: string
  userId: string
  providerPaymentId: string
  providerStatus: string
  pixQrCode: string | null
  pixQrCodeBase64: string | null
  pixTicketUrl: string | null
  expiresAt: string
}

function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role environment variables are missing.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function createTrustedPaymentOrder(input: CreateTrustedPaymentOrderInput) {
  return getServiceSupabase()
    .from('payment_orders')
    .insert({
      user_id: input.userId,
      product_type: input.productType,
      product_id: input.productId,
      amount_itacash: input.amountItacash,
      base_amount_brl_cents: input.baseAmountBrlCents,
      platform_fee_percent: input.platformFeePercent,
      platform_fee_brl_cents: input.platformFeeBrlCents,
      operator_fee_percent: input.operatorFeePercent,
      operator_fee_brl_cents: input.operatorFeeBrlCents,
      total_brl_cents: input.totalBrlCents,
      provider: 'mercadopago',
      external_reference: `entreus_${randomUUID().replaceAll('-', '')}`,
      status: 'pending',
      metadata: input.metadata,
    })
    .select('id, external_reference, product_id, product_type, status, amount_itacash, base_amount_brl_cents, platform_fee_brl_cents, operator_fee_brl_cents, total_brl_cents, metadata, provider_init_point, created_at')
    .single<TrustedPaymentOrder>()
}

export async function attachTrustedMercadoPagoPreference(input: {
  orderId: string
  userId: string
  providerPreferenceId: string
  providerInitPoint: string
}) {
  return getServiceSupabase()
    .from('payment_orders')
    .update({
      provider_preference_id: input.providerPreferenceId.trim(),
      provider_init_point: input.providerInitPoint.trim(),
    })
    .eq('id', input.orderId)
    .eq('user_id', input.userId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
}

export async function attachTrustedMercadoPagoPix(input: AttachPixInput) {
  return getServiceSupabase()
    .from('payment_orders')
    .update({
      provider_payment_id: input.providerPaymentId.trim(),
      provider_status: input.providerStatus.trim(),
      provider_payment_method: 'pix',
      pix_qr_code: input.pixQrCode?.trim() || null,
      pix_qr_code_base64: input.pixQrCodeBase64?.trim() || null,
      pix_ticket_url: input.pixTicketUrl?.trim() || null,
      expires_at: input.expiresAt,
    })
    .eq('id', input.orderId)
    .eq('user_id', input.userId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePaymentTotals } from '@/lib/payment-fees'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'
import { resolvePixConfiguration } from '@/lib/payments/pix-config'
import { paymentError } from '@/lib/payments/errors'
import { getBearerAuthorization } from '@/lib/payments/server-auth'
import { getUploadPolicy, validateFileContent } from '@/lib/upload-security'

const PROOF_BUCKET = 'payment-proofs'
const MAX_ITACASH_PER_REQUEST = 1_000_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PROOF_FILE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}\.(?:png|jpe?g|pdf)$/i

function getSupabaseForRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('supabase_configuration_missing')
  const authorization = request.headers.get('authorization') || ''
  return createClient(url, key, { global: { headers: authorization ? { Authorization: authorization } : {} } })
}

function parseProofPath(value: unknown, userId: string, requestId: string) {
  if (typeof value !== 'string' || value.includes('\\') || value.includes('..')) return null
  const parts = value.split('/')
  if (parts.length !== 3 || parts[0] !== userId || parts[1] !== requestId || !PROOF_FILE_PATTERN.test(parts[2])) return null
  return { path: value, folder: `${userId}/${requestId}`, filename: parts[2] }
}

export async function POST(request: Request) {
  const requestId = getRequestCorrelationId(request)
  try {
    if (!getBearerAuthorization(request)) return NextResponse.json(paymentError('authentication_required'), { status: 401 })
    const supabase = getSupabaseForRequest(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(paymentError('authentication_rejected'), { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const amountItacash = Number(body?.amount_itacash)
    const purchaseRequestId = typeof body?.request_id === 'string' ? body.request_id : ''
    if (!Number.isSafeInteger(amountItacash) || amountItacash <= 0 || amountItacash > MAX_ITACASH_PER_REQUEST || !UUID_PATTERN.test(purchaseRequestId)) {
      return NextResponse.json({ error: 'Dados da solicitacao invalidos.', code: 'invalid_payment_request' }, { status: 400 })
    }

    const proof = parseProofPath(body?.proof_path, user.id, purchaseRequestId)
    if (!proof) {
      return NextResponse.json({ error: 'Comprovante invalido para esta solicitacao.', code: 'invalid_payment_proof' }, { status: 400 })
    }

    const pixConfigResult = resolvePixConfiguration()
    if (!pixConfigResult.ok) return NextResponse.json(paymentError(pixConfigResult.code), { status: 503 })
    const pixConfig = pixConfigResult.config

    const { data: proofFiles, error: proofError } = await supabase.storage
      .from(PROOF_BUCKET)
      .list(proof.folder, { limit: 2, search: proof.filename })
    const proofFile = proofFiles?.find((file) => file.name === proof.filename)
    const proofSize = proofFile?.metadata?.size
    const proofMime = proofFile?.metadata?.mimetype
    if (proofError || !proofFile) {
      return NextResponse.json({ error: 'O comprovante enviado nao foi encontrado.', code: 'payment_proof_not_found' }, { status: 400 })
    }
    if (typeof proofSize !== 'number' || proofSize <= 0 || proofSize > getUploadPolicy('payment_proof').maxBytes || typeof proofMime !== 'string') {
      return NextResponse.json({ error: 'O comprovante enviado e invalido.', code: 'invalid_payment_proof' }, { status: 400 })
    }

    const { data: proofBlob, error: downloadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .download(proof.path)
    if (downloadError || !proofBlob) {
      return NextResponse.json({ error: 'O comprovante enviado nao foi encontrado.', code: 'payment_proof_not_found' }, { status: 400 })
    }

    const proofValidation = validateFileContent({
      context: 'payment_proof',
      bytes: await proofBlob.arrayBuffer(),
      declaredSize: proofSize,
      declaredMime: proofMime,
      fileName: proof.filename,
    })
    if (!proofValidation.ok) {
      return NextResponse.json({ error: 'O comprovante enviado e invalido.', code: 'invalid_payment_proof' }, { status: 400 })
    }

    const totals = calculatePaymentTotals(amountItacash * 10, 'pix_manual')
    const userNote = typeof body?.user_note === 'string' ? body.user_note.trim().slice(0, 500) : ''
    const { error: insertError } = await supabase.from('itacash_purchase_requests').insert({
      id: purchaseRequestId,
      user_id: user.id,
      amount_itacash: amountItacash,
      base_amount_brl_cents: totals.baseAmountBrlCents,
      platform_fee_percent: totals.platformFeePercent,
      platform_fee_brl_cents: totals.platformFeeBrlCents,
      operator_fee_percent: totals.operatorFeePercent,
      operator_fee_brl_cents: totals.operatorFeeBrlCents,
      total_brl_cents: totals.totalBrlCents,
      payment_method: 'pix_manual',
      status: 'pending',
      user_note: userNote || null,
      proof_path: proof.path,
      proof_uploaded_at: new Date().toISOString(),
      pix_key_snapshot: pixConfig.pixKey,
      pix_total_brl_cents: totals.totalBrlCents,
    })

    if (insertError) {
      logServerEvent('error', {
        event: 'pix_manual_request.insert_failed',
        requestId,
        context: { amountItacash },
      })
      return NextResponse.json({ error: 'O comprovante foi enviado, mas a solicitacao nao foi concluida.', code: 'payment_request_creation_failed' }, { status: 500 })
    }

    return NextResponse.json({ request_id: purchaseRequestId, amount_itacash: amountItacash, total_brl_cents: totals.totalBrlCents, status: 'pending' })
  } catch {
    logServerEvent('error', { event: 'pix_manual_request.unexpected_error', requestId })
    return NextResponse.json(paymentError('temporary_pix_error'), { status: 500 })
  }
}

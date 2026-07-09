import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'
import {
  formatWithdrawalPaymentDetailsSummary,
  getCreatorWithdrawalErrorMessage,
  getWithdrawalPaymentMethodLabel,
  normalizeWithdrawalPaymentMethod,
  normalizeCreatorWithdrawalRpcError,
  normalizeWithdrawalStatus,
  type CreatorWithdrawalErrorReason,
  type CreatorWithdrawalPaymentDetails,
  type PixWithdrawalPaymentDetails,
} from '@/lib/creator-withdrawals'

export const dynamic = 'force-dynamic'

type ProfileSummary = {
  id: string
  username: string | null
  display_name: string | null
}

type CreatorWithdrawalRow = {
  user_id: string
  payment_method?: string | null
  payment_details?: unknown
  pix_key?: string | null
  pix_key_type?: string | null
  holder_name?: string | null
}

const WITHDRAWAL_SELECT_WITH_PAYMENT = 'id, user_id, wallet_id, amount_itacash, amount_brl, itacash_per_brl, payment_method, payment_details, pix_key, pix_key_type, holder_name, status, admin_notes, rejection_reason, reviewed_by, reviewed_at, paid_at, created_at, updated_at'
const WITHDRAWAL_SELECT_LEGACY = 'id, user_id, wallet_id, amount_itacash, amount_brl, itacash_per_brl, pix_key, pix_key_type, holder_name, status, admin_notes, rejection_reason, reviewed_by, reviewed_at, paid_at, created_at, updated_at'

function getSupabaseForRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authorization = request.headers.get('authorization') || ''

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase public environment variables are missing.')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
}

function statusForReason(reason: CreatorWithdrawalErrorReason) {
  if (reason === 'not_authenticated') return 401
  if (reason === 'admin_required') return 403
  if (reason === 'request_not_found') return 404
  if (reason === 'rpc_unavailable') return 503
  if (reason === 'internal') return 500
  return 400
}

function jsonWithdrawalError(reason: CreatorWithdrawalErrorReason, status = statusForReason(reason)) {
  return NextResponse.json(
    { ok: false, reason, error: getCreatorWithdrawalErrorMessage(reason) },
    { status },
  )
}

function isMissingPaymentSchemaError(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || '').toLowerCase()
    : ''

  return message.includes('payment_method') || message.includes('payment_details')
}

function asPaymentDetails(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function buildLegacyPixDetails(row: CreatorWithdrawalRow): PixWithdrawalPaymentDetails {
  return {
    method: 'pix',
    pixKey: row.pix_key || '',
    pixKeyType: row.pix_key_type === 'cnpj' || row.pix_key_type === 'email' || row.pix_key_type === 'phone' || row.pix_key_type === 'random'
      ? row.pix_key_type
      : 'cpf',
    holderName: row.holder_name || '',
  }
}

function normalizeWithdrawalRow<T extends CreatorWithdrawalRow>(row: T) {
  const paymentMethod = normalizeWithdrawalPaymentMethod(row.payment_method) || 'pix'
  const paymentDetails = Object.keys(asPaymentDetails(row.payment_details)).length > 0
    ? row.payment_details as CreatorWithdrawalPaymentDetails
    : buildLegacyPixDetails(row)

  return {
    ...row,
    payment_method: paymentMethod,
    payment_details: paymentDetails,
    payment_method_label: getWithdrawalPaymentMethodLabel(paymentMethod),
    payment_summary: formatWithdrawalPaymentDetailsSummary(paymentMethod, paymentDetails),
  }
}

async function validateAdmin(request: Request) {
  const supabase = getSupabaseForRequest(request)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false as const, reason: 'not_authenticated' as const, status: 401 }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !isAdminRole(profile?.role)) {
    return { ok: false as const, reason: 'admin_required' as const, status: 403 }
  }

  return { ok: true as const, supabase, userId: user.id }
}

export async function GET(request: Request) {
  try {
    const admin = await validateAdmin(request)

    if (!admin.ok) {
      return jsonWithdrawalError(admin.reason, admin.status)
    }

    const url = new URL(request.url)
    const requestedStatus = url.searchParams.get('status')
    const status = requestedStatus === 'all' || !requestedStatus
      ? null
      : normalizeWithdrawalStatus(requestedStatus)

    let query = admin.supabase
      .from('creator_withdrawal_requests')
      .select(WITHDRAWAL_SELECT_WITH_PAYMENT)
      .order('created_at', { ascending: false })
      .limit(100)

    if (status) {
      query = query.eq('status', status)
    }

    const initialResult = await query
    let data = initialResult.data as CreatorWithdrawalRow[] | null
    let error = initialResult.error

    if (error && isMissingPaymentSchemaError(error)) {
      let legacyQuery = admin.supabase
        .from('creator_withdrawal_requests')
        .select(WITHDRAWAL_SELECT_LEGACY)
        .order('created_at', { ascending: false })
        .limit(100)

      if (status) {
        legacyQuery = legacyQuery.eq('status', status)
      }

      const legacyResult = await legacyQuery
      data = legacyResult.data as CreatorWithdrawalRow[] | null
      error = legacyResult.error
    }

    if (error) {
      const reason = normalizeCreatorWithdrawalRpcError(error)
      return jsonWithdrawalError(reason, statusForReason(reason))
    }

    const rows = (data || []) as CreatorWithdrawalRow[]
    const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)))
    let profilesById: Record<string, ProfileSummary> = {}

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await admin.supabase
        .from('profiles')
        .select('id, username, display_name')
        .in('id', userIds)

      if (!profilesError) {
        profilesById = ((profiles || []) as ProfileSummary[]).reduce(
          (acc, profile) => {
            acc[profile.id] = profile
            return acc
          },
          {} as Record<string, ProfileSummary>,
        )
      }
    }

    return NextResponse.json({
      ok: true,
      withdrawals: (data || []).map((row) => ({
        ...normalizeWithdrawalRow(row as CreatorWithdrawalRow),
        creator: profilesById[(row as CreatorWithdrawalRow).user_id] || null,
      })),
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AdminCreatorWithdrawals] GET failed:', error)
    }
    return jsonWithdrawalError('internal', 500)
  }
}

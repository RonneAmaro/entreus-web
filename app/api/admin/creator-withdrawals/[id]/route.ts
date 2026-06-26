import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'
import {
  getCreatorWithdrawalErrorMessage,
  isUuid,
  normalizeCreatorWithdrawalRpcError,
  type CreatorWithdrawalErrorReason,
} from '@/lib/creator-withdrawals'

export const dynamic = 'force-dynamic'

type AdminWithdrawalPatchBody = {
  action?: unknown
  status?: unknown
  reason?: unknown
  rejectionReason?: unknown
  rejection_reason?: unknown
  adminNotes?: unknown
  admin_notes?: unknown
}

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

function sanitizeText(value: unknown, maxLength = 1000) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params

    if (!isUuid(id)) {
      return jsonWithdrawalError('request_not_found', 404)
    }

    const body = (await request.json().catch(() => ({}))) as AdminWithdrawalPatchBody
    const action = typeof (body.action ?? body.status) === 'string'
      ? String(body.action ?? body.status).trim().toLowerCase()
      : ''

    if (action !== 'paid' && action !== 'reject' && action !== 'rejected') {
      return jsonWithdrawalError('action_not_allowed', 400)
    }

    const admin = await validateAdmin(request)

    if (!admin.ok) {
      return jsonWithdrawalError(admin.reason, admin.status)
    }

    if (action === 'paid') {
      const adminNotes = sanitizeText(body.adminNotes ?? body.admin_notes, 1000) || null
      const { data, error } = await admin.supabase.rpc('mark_creator_withdrawal_paid', {
        p_request_id: id,
        p_admin_notes: adminNotes,
      })

      if (error) {
        const reason = normalizeCreatorWithdrawalRpcError(error)
        return jsonWithdrawalError(reason, statusForReason(reason))
      }

      return NextResponse.json({ ok: true, withdrawal: data || null, message: 'Solicitacao marcada como paga.' })
    }

    const reasonText = sanitizeText(
      body.reason ?? body.rejectionReason ?? body.rejection_reason ?? body.adminNotes ?? body.admin_notes,
      1000,
    )

    if (!reasonText) {
      return jsonWithdrawalError('action_not_allowed', 400)
    }

    const { data, error } = await admin.supabase.rpc('reject_creator_withdrawal', {
      p_request_id: id,
      p_reason: reasonText,
    })

    if (error) {
      const reason = normalizeCreatorWithdrawalRpcError(error)
      return jsonWithdrawalError(reason, statusForReason(reason))
    }

    return NextResponse.json({ ok: true, withdrawal: data || null, message: 'Solicitacao recusada e saldo estornado.' })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AdminCreatorWithdrawals] PATCH failed:', error)
    }
    return jsonWithdrawalError('internal', 500)
  }
}

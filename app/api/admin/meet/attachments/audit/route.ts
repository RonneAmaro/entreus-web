import { isAdminRole } from '@/lib/admin'
import { getSupabaseAdmin, jsonError, requireUser } from '@/lib/meet-server'
import { NextResponse } from 'next/server'

const ATTACHMENT_TTL_HOURS = 24
const MAX_AUDIT_ROWS = 5000
const PAGE_SIZE = 1000
const RECENT_LIMIT = 40

type AttachmentAuditRow = {
  id: string
  room_name: string | null
  created_at: string | null
  attachment_name: string | null
  attachment_size: number | null
}

function maskRoomName(roomName: string | null | undefined) {
  const value = (roomName || '').trim()
  if (!value) return 'sala-indisponivel'
  if (value.length <= 6) return `${value.slice(0, 2)}...`
  return `${value.slice(0, 3)}...${value.slice(-2)}`
}

function bytesToNumber(value: number | null | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : 0
}

function isExpired(createdAt: string | null | undefined, cutoffMs: number) {
  if (!createdAt) return false
  const createdMs = Date.parse(createdAt)
  return Number.isFinite(createdMs) && createdMs < cutoffMs
}

export async function GET(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuracao Supabase ausente no servidor.', 500)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (profileError) {
    return jsonError('Nao foi possivel verificar permissao admin.', 500)
  }

  if (!isAdminRole(profile?.role)) {
    return jsonError('Acesso restrito a administradores.', 403)
  }

  const now = Date.now()
  const cutoffMs = now - ATTACHMENT_TTL_HOURS * 60 * 60 * 1000
  const cutoffIso = new Date(cutoffMs).toISOString()

  const { count, error: countError } = await supabase
    .from('meet_room_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'attachment')

  if (countError) {
    return jsonError('Nao foi possivel contar anexos do Meet.', 500)
  }

  const totalAttachments = count || 0
  const rowsToRead = Math.min(totalAttachments, MAX_AUDIT_ROWS)
  const allRows: AttachmentAuditRow[] = []

  for (let from = 0; from < rowsToRead; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, rowsToRead - 1)
    const { data, error } = await supabase
      .from('meet_room_chat_messages')
      .select('id, room_name, created_at, attachment_name, attachment_size')
      .eq('type', 'attachment')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      return jsonError('Nao foi possivel carregar auditoria dos anexos.', 500)
    }

    allRows.push(...((data || []) as AttachmentAuditRow[]))
  }

  const summary = allRows.reduce(
    (acc, row) => {
      const size = bytesToNumber(row.attachment_size)
      const expired = isExpired(row.created_at, cutoffMs)

      acc.totalApproxBytes += size
      if (expired) {
        acc.expiredAttachments += 1
        acc.expiredApproxBytes += size
      } else {
        acc.activeAttachments += 1
        acc.activeApproxBytes += size
      }

      return acc
    },
    {
      activeAttachments: 0,
      expiredAttachments: 0,
      totalApproxBytes: 0,
      activeApproxBytes: 0,
      expiredApproxBytes: 0,
    },
  )

  const recentAttachments = allRows.slice(0, RECENT_LIMIT).map((row) => {
    const expired = isExpired(row.created_at, cutoffMs)

    return {
      id: row.id,
      createdAt: row.created_at,
      roomNameMasked: maskRoomName(row.room_name),
      attachmentName: row.attachment_name || 'arquivo',
      attachmentSize: bytesToNumber(row.attachment_size),
      status: expired ? 'expired' : 'active',
    }
  })

  return NextResponse.json({
    ok: true,
    dryRun: true,
    deletesFiles: false,
    policy: {
      ttlHours: ATTACHMENT_TTL_HOURS,
      cutoffIso,
      description: 'Anexos do Meet sao considerados temporarios e devem expirar apos 24 horas.',
    },
    summary: {
      totalAttachments,
      auditedAttachments: allRows.length,
      hasMoreThanAuditLimit: totalAttachments > MAX_AUDIT_ROWS,
      ...summary,
    },
    recentAttachments,
  })
}

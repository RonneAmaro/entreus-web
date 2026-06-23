import { isAdminRole } from '@/lib/admin'
import { getSupabaseAdmin, jsonError, requireUser } from '@/lib/meet-server'
import {
  getMeetRecordingEnvironmentDiagnostics,
  toSafeMeetRecordingDiagnosticsPayload,
} from '@/lib/meet/recording-environment'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuração Supabase ausente no servidor.', 500)

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (error) return jsonError('Não foi possível verificar a permissão administrativa.', 500)
  if (!isAdminRole(profile?.role)) return jsonError('Acesso restrito a administradores.', 403)

  return NextResponse.json(
    toSafeMeetRecordingDiagnosticsPayload(getMeetRecordingEnvironmentDiagnostics()),
  )
}

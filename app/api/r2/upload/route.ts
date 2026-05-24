import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Legacy endpoint kept only for compatibility. Heavy media uploads must use /api/r2/presign.
const LEGACY_UPLOAD_MESSAGE =
  'Upload direto por esta rota foi descontinuado para arquivos grandes. Use o fluxo otimizado de upload.'

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'LEGACY_UPLOAD_DISABLED',
      message: LEGACY_UPLOAD_MESSAGE,
      uploadEndpoint: '/api/r2/presign',
    },
    { status: 410 },
  )
}

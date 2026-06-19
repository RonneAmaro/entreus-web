import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin, jsonError, requireUser } from '@/lib/meet-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPABASE_BUCKET_NAME = 'message-media'
const R2_PRIVATE_PREFIX = 'private/messages/'
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60

type AttachmentRow = {
  id: string
  conversation_id: string
  message_id: string
  sender_id: string
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
}

function isSafeId(value: string | null) {
  return Boolean(value && /^[0-9a-fA-F-]{20,80}$/.test(value))
}

function isSafeObjectPath(value: string) {
  return Boolean(
    value &&
      !value.startsWith('/') &&
      !value.includes('..') &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      !value.includes('?') &&
      !value.includes('#'),
  )
}

function getR2PrivateKey(value: string) {
  const trimmed = value.trim()
  const key = trimmed.startsWith('r2://')
    ? trimmed.slice('r2://'.length).replace(/^\/+/, '')
    : trimmed.replace(/^\/+/, '')

  if (!key.startsWith(R2_PRIVATE_PREFIX)) return null
  if (!isSafeObjectPath(key)) return null

  return key
}

function parseSupabaseStorageReference(value: string) {
  const raw = value.trim()

  try {
    const parsed = new URL(raw)
    const pathname = decodeURIComponent(parsed.pathname)
    const marker = '/storage/v1/object/'
    const markerIndex = pathname.indexOf(marker)

    if (markerIndex === -1) return null

    const segments = pathname
      .slice(markerIndex + marker.length)
      .split('/')
      .filter(Boolean)

    if (segments.length < 3) return null

    segments.shift()
    const bucket = segments.shift()
    const objectPath = segments.join('/')

    if (bucket !== SUPABASE_BUCKET_NAME || !isSafeObjectPath(objectPath)) {
      return null
    }

    return { bucket, objectPath }
  } catch {
    const objectPath = raw.replace(/^\/+/, '')
    if (!isSafeObjectPath(objectPath)) return null
    return { bucket: SUPABASE_BUCKET_NAME, objectPath }
  }
}

function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      getR2BucketName(),
  )
}

function getR2BucketName() {
  return (
    process.env.R2_MESSAGE_ATTACHMENTS_BUCKET_NAME ||
    process.env.R2_PRIVATE_BUCKET_NAME ||
    process.env.R2_BUCKET_NAME ||
    ''
  )
}

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  })
}

function getSafeFileName(value: string | null) {
  const safe = String(value || 'arquivo')
    .replace(/[/\\]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 120)

  return safe || 'arquivo'
}

function getInlineDisposition(fileName: string) {
  return `inline; filename="${fileName.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

async function canAccessConversation(supabase: ReturnType<typeof getSupabaseAdmin>, conversationId: string, userId: string) {
  if (!supabase) return false

  const { data, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error('Conversation participant lookup failed.')
  }

  return Boolean(data)
}

export async function GET(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuracao Supabase ausente no servidor.', 500)

  const { searchParams } = new URL(request.url)
  const attachmentId = searchParams.get('attachmentId')

  if (!isSafeId(attachmentId)) {
    return jsonError('Anexo invalido.', 400)
  }

  const { data, error } = await supabase
    .from('message_attachments')
    .select('id, conversation_id, message_id, sender_id, storage_path, file_name, mime_type')
    .eq('id', attachmentId)
    .maybeSingle()

  if (error || !data) {
    return jsonError('Anexo nao encontrado.', 404)
  }

  const attachment = data as AttachmentRow

  try {
    const allowed = await canAccessConversation(supabase, attachment.conversation_id, auth.user.id)
    if (!allowed) {
      return jsonError('Voce nao tem permissao para acessar este anexo.', 403)
    }
  } catch {
    return jsonError('Nao foi possivel validar o acesso ao anexo.', 500)
  }

  if (!attachment.storage_path) {
    return jsonError('Anexo invalido.', 400)
  }

  const fileName = getSafeFileName(attachment.file_name)
  const r2Key = getR2PrivateKey(attachment.storage_path)

  if (r2Key) {
    if (!hasR2Config()) {
      return jsonError('Configuracao R2 ausente no servidor.', 500)
    }

    try {
      const url = await getSignedUrl(
        getR2Client(),
        new GetObjectCommand({
          Bucket: getR2BucketName(),
          Key: r2Key,
          ResponseContentDisposition: getInlineDisposition(fileName),
          ResponseContentType: attachment.mime_type || undefined,
        }),
        { expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS },
      )

      return NextResponse.json({
        ok: true,
        provider: 'cloudflare-r2',
        url,
        expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS,
      })
    } catch {
      return jsonError('Nao foi possivel gerar o acesso temporario ao anexo.', 500)
    }
  }

  const supabaseReference = parseSupabaseStorageReference(attachment.storage_path)
  if (!supabaseReference) {
    return jsonError('Referencia de anexo invalida.', 400)
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(supabaseReference.bucket)
    .createSignedUrl(supabaseReference.objectPath, SIGNED_URL_EXPIRES_IN_SECONDS)

  if (signedError || !signedData?.signedUrl) {
    return jsonError('Nao foi possivel gerar o acesso temporario ao anexo.', 500)
  }

  return NextResponse.json({
    ok: true,
    provider: 'supabase-storage',
    url: signedData.signedUrl,
    expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS,
  })
}

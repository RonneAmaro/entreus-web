import { ListObjectsV2Command, S3Client, type _Object } from '@aws-sdk/client-s3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/admin'
import { extractR2MediaKey } from '@/lib/r2-media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type UsedMediaRow = {
  image_url?: string | null
  video_url?: string | null
  media_url?: string | null
}

type AuditObject = {
  key: string
  size: number
  lastModified: string | null
}

type ReferenceSource = 'posts' | 'post_media' | 'comment_media'

type UsedMediaResult = {
  usedKeys: Set<string>
  warnings: string[]
  sourceCounts: Record<ReferenceSource, number>
}

const AUDITED_PREFIXES = ['posts/', 'comments/'] as const
const DEFAULT_LIMIT_PER_PREFIX = 250
const MAX_LIMIT_PER_PREFIX = 1000
const MAX_ORPHAN_SAMPLE = 50
const MAX_REFERENCE_ROWS = 10000

function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_BASE_URL,
  )
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

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
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

function getLimitPerPrefix(request: Request) {
  const url = new URL(request.url)
  const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '', 10)

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) return DEFAULT_LIMIT_PER_PREFIX

  return Math.min(parsedLimit, MAX_LIMIT_PER_PREFIX)
}

function toAuditObject(item: _Object): AuditObject | null {
  if (!item.Key) return null

  return {
    key: item.Key,
    size: item.Size || 0,
    lastModified: item.LastModified?.toISOString() || null,
  }
}

async function listR2Objects(limitPerPrefix: number) {
  const client = getR2Client()
  const bucketName = process.env.R2_BUCKET_NAME as string
  const objects: AuditObject[] = []
  const countsByPrefix: Record<string, number> = {}
  const truncatedPrefixes: string[] = []

  for (const prefix of AUDITED_PREFIXES) {
    let continuationToken: string | undefined
    let prefixCount = 0

    while (prefixCount < limitPerPrefix) {
      const remainingForPrefix = limitPerPrefix - prefixCount
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          MaxKeys: Math.min(remainingForPrefix, 1000),
          ContinuationToken: continuationToken,
        }),
      )

      for (const item of response.Contents || []) {
        const auditObject = toAuditObject(item)
        if (auditObject) {
          objects.push(auditObject)
          prefixCount += 1
        }
      }

      if (!response.IsTruncated || !response.NextContinuationToken) {
        break
      }

      if (prefixCount >= limitPerPrefix) {
        truncatedPrefixes.push(prefix)
        break
      }

      continuationToken = response.NextContinuationToken
    }

    countsByPrefix[prefix] = prefixCount
  }

  return {
    objects,
    countsByPrefix,
    truncatedPrefixes,
  }
}

function addUsedKeysFromRows(
  rows: UsedMediaRow[] | null,
  usedKeys: Set<string>,
  publicBaseUrl: string,
  sourceCount: { value: number },
) {
  for (const row of rows || []) {
    for (const value of [row.image_url, row.video_url, row.media_url]) {
      const key = extractR2MediaKey(value, publicBaseUrl)
      if (key) {
        usedKeys.add(key)
        sourceCount.value += 1
      }
    }
  }
}

async function loadUsedR2Keys(supabase: SupabaseClient): Promise<UsedMediaResult> {
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL as string
  const usedKeys = new Set<string>()
  const warnings: string[] = []
  const sourceCounts: Record<ReferenceSource, number> = {
    posts: 0,
    post_media: 0,
    comment_media: 0,
  }

  const { data: postRows, error: postsError } = await supabase
    .from('posts')
    .select('image_url, video_url')
    .range(0, MAX_REFERENCE_ROWS - 1)

  if (postsError) {
    warnings.push(`posts: ${postsError.message}`)
  } else {
    const sourceCount = { value: 0 }
    addUsedKeysFromRows((postRows || []) as UsedMediaRow[], usedKeys, publicBaseUrl, sourceCount)
    sourceCounts.posts = sourceCount.value
  }

  const { data: postMediaRows, error: postMediaError } = await supabase
    .from('post_media')
    .select('media_url')
    .range(0, MAX_REFERENCE_ROWS - 1)

  if (postMediaError) {
    warnings.push(`post_media: ${postMediaError.message}`)
  } else {
    const sourceCount = { value: 0 }
    addUsedKeysFromRows((postMediaRows || []) as UsedMediaRow[], usedKeys, publicBaseUrl, sourceCount)
    sourceCounts.post_media = sourceCount.value
  }

  const { data: commentMediaRows, error: commentMediaError } = await supabase
    .from('comment_media')
    .select('media_url')
    .range(0, MAX_REFERENCE_ROWS - 1)

  if (commentMediaError) {
    warnings.push(`comment_media: ${commentMediaError.message}`)
  } else {
    const sourceCount = { value: 0 }
    addUsedKeysFromRows((commentMediaRows || []) as UsedMediaRow[], usedKeys, publicBaseUrl, sourceCount)
    sourceCounts.comment_media = sourceCount.value
  }

  return {
    usedKeys,
    warnings,
    sourceCounts,
  }
}

async function validateAdmin(request: Request) {
  const supabase = getSupabaseForRequest(request)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false as const, status: 401, error: 'UNAUTHORIZED' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !isAdminRole(profile?.role)) {
    return { ok: false as const, status: 403, error: 'FORBIDDEN' }
  }

  return { ok: true as const, userId: user.id }
}

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { ok: false, error: 'SERVER_AUTH_CONFIG_MISSING' },
      { status: 500 },
    )
  }

  const admin = await validateAdmin(request)

  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status })
  }

  if (!hasR2Config()) {
    return NextResponse.json(
      { ok: false, error: 'R2_CONFIG_MISSING' },
      { status: 500 },
    )
  }

  const supabaseService = getSupabaseServiceClient()

  if (!supabaseService) {
    return NextResponse.json(
      { ok: false, error: 'SUPABASE_SERVICE_ROLE_MISSING' },
      { status: 500 },
    )
  }

  const limitPerPrefix = getLimitPerPrefix(request)
  const auditResults = await (async () => {
    try {
      return await Promise.all([
        listR2Objects(limitPerPrefix),
        loadUsedR2Keys(supabaseService),
      ])
    } catch (error) {
      console.warn('[R2OrphansAudit] Audit failed:', error instanceof Error ? error.message : 'unknown error')

      return null
    }
  })()

  if (!auditResults) {
    return NextResponse.json(
      { ok: false, error: 'R2_AUDIT_FAILED' },
      { status: 502 },
    )
  }

  const [r2Listing, usedMedia] = auditResults

  const objects = r2Listing.objects
  const usedObjects = objects.filter((item) => usedMedia.usedKeys.has(item.key))
  const possibleOrphans = objects.filter((item) => !usedMedia.usedKeys.has(item.key))
  const orphanBytes = possibleOrphans.reduce((total, item) => total + item.size, 0)
  const sampleOrphans = possibleOrphans.slice(0, MAX_ORPHAN_SAMPLE)

  return NextResponse.json({
    ok: true,
    mode: 'audit_only',
    dryRun: true,
    deleted: false,
    prefixes: AUDITED_PREFIXES,
    limitPerPrefix,
    maxReferenceRows: MAX_REFERENCE_ROWS,
    totalObjectsAnalyzed: objects.length,
    totalReferencedObjects: usedObjects.length,
    totalPossibleOrphans: possibleOrphans.length,
    estimatedOrphanBytes: orphanBytes,
    analyzedObjects: objects.length,
    analyzedObjectsByPrefix: r2Listing.countsByPrefix,
    truncatedPrefixes: r2Listing.truncatedPrefixes,
    usedObjects: usedObjects.length,
    possibleOrphans: possibleOrphans.length,
    possibleOrphanBytes: orphanBytes,
    possibleOrphanMegabytes: Number((orphanBytes / 1024 / 1024).toFixed(2)),
    usedReferenceKeys: usedMedia.usedKeys.size,
    usedReferencesBySource: usedMedia.sourceCounts,
    warnings: usedMedia.warnings,
    sampleOrphans,
    sample: sampleOrphans,
  })
}


#!/usr/bin/env node

/**
 * Extended dry-run audit for media and attachment references.
 *
 * This script only reads database rows and writes a local JSON report.
 * It never updates Supabase, never uploads to R2, never deletes objects,
 * and redacts examples for private or sensitive sources.
 */

const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

const DEFAULT_PAGE_SIZE = 500
const DEFAULT_MAX_ROWS_PER_SOURCE = 5000
const REPORT_PATH = path.join(process.cwd(), 'reports', 'media-migration-extended-dry-run.json')
const PRIVATE_MESSAGE_R2_PREFIX = 'private/messages/'
const AGE_VERIFICATION_R2_PREFIX = 'private/age-verifications/'

const CLASSIFICATIONS = [
  'supabase-storage',
  'cloudflare-r2',
  'external-url',
  'local-public',
  'empty/null',
  'unknown',
]

const SOURCES = [
  {
    table: 'posts',
    idFields: ['id'],
    field: 'image_url',
    area: 'public-posts',
    privacy: 'public',
    referenceKind: 'url-or-path',
    risk: 'high-public-image',
    foundIn: ['scripts/audit-media-migration-to-r2.js', 'docs/supabase-storage-to-r2-audit.md'],
  },
  {
    table: 'posts',
    idFields: ['id'],
    field: 'video_url',
    area: 'public-posts',
    privacy: 'public',
    referenceKind: 'url-or-path',
    risk: 'very-high-public-video',
    foundIn: ['scripts/audit-media-migration-to-r2.js', 'docs/supabase-storage-to-r2-audit.md'],
  },
  {
    table: 'post_media',
    idFields: ['id'],
    field: 'media_url',
    area: 'public-posts',
    privacy: 'public',
    referenceKind: 'url-or-path',
    risk: 'high-public-post-media',
    foundIn: ['scripts/audit-media-migration-to-r2.js', 'docs/supabase-storage-to-r2-audit.md'],
  },
  {
    table: 'comment_media',
    idFields: ['id'],
    field: 'media_url',
    area: 'public-comments',
    privacy: 'public',
    referenceKind: 'url-or-path',
    risk: 'medium-public-comment-media',
    foundIn: ['scripts/audit-media-migration-to-r2.js', 'docs/supabase-storage-to-r2-audit.md'],
  },
  {
    table: 'profiles',
    idFields: ['id'],
    field: 'avatar_url',
    area: 'public-profiles',
    privacy: 'public',
    referenceKind: 'url-or-path',
    risk: 'high-public-avatar',
    foundIn: ['app/profile/page.tsx', 'docs/supabase-storage-to-r2-audit.md'],
  },
  {
    table: 'profiles',
    idFields: ['id'],
    field: 'banner_url',
    area: 'public-profiles',
    privacy: 'public',
    referenceKind: 'url-or-path',
    risk: 'high-public-banner',
    foundIn: ['app/profile/page.tsx', 'docs/supabase-storage-to-r2-audit.md'],
  },
  {
    table: 'digital_gifts',
    idFields: ['id'],
    field: 'media_url',
    area: 'public-gifts',
    privacy: 'public',
    referenceKind: 'url-or-path',
    risk: 'local-public-catalog-media',
    foundIn: ['supabase/migrations/20260518_seed_digital_gifts_videos.sql'],
  },
  {
    table: 'community_challenges',
    idFields: ['id'],
    field: 'banner_url',
    area: 'public-challenges',
    privacy: 'public',
    referenceKind: 'url-or-path',
    risk: 'optional-public-banner',
    foundIn: ['supabase/migrations/20260516_create_community_challenges.sql'],
  },
  {
    table: 'conversation_user_state',
    idFields: ['conversation_id', 'user_id'],
    field: 'chat_background_url',
    area: 'private-messages',
    privacy: 'private',
    referenceKind: 'url-or-path',
    risk: 'private-chat-customization',
    foundIn: ['supabase/migrations/20260515_add_chat_customization_to_conversation_user_state.sql'],
  },
  {
    table: 'message_attachments',
    idFields: ['id'],
    field: 'storage_path',
    area: 'private-message-attachments',
    privacy: 'private',
    referenceKind: 'supabase-storage-path',
    bucket: 'message-media',
    risk: 'private-message-attachment',
    foundIn: ['app/messages/[id]/page.tsx', 'docs/supabase-storage-to-r2-audit.md'],
  },
  {
    table: 'meet_room_chat_messages',
    idFields: ['id'],
    field: 'attachment_path',
    area: 'private-meet-attachments',
    privacy: 'private',
    referenceKind: 'supabase-storage-path',
    bucket: 'meet-chat-attachments',
    risk: 'private-meet-attachment',
    foundIn: ['app/api/meet/rooms/[roomName]/messages/attachments/route.ts', 'supabase/migrations/20260603_add_meet_chat_attachments.sql'],
  },
  {
    table: 'age_verification_requests',
    idFields: ['id'],
    field: 'document_front_path',
    area: 'sensitive-age-verification',
    privacy: 'sensitive',
    referenceKind: 'supabase-storage-path',
    bucket: 'age-verifications',
    risk: 'sensitive-18-plus-document',
    foundIn: ['app/age-verification/page.tsx', 'supabase/migrations/20260517_add_age_verification_documents.sql'],
  },
  {
    table: 'age_verification_requests',
    idFields: ['id'],
    field: 'document_back_path',
    area: 'sensitive-age-verification',
    privacy: 'sensitive',
    referenceKind: 'supabase-storage-path',
    bucket: 'age-verifications',
    risk: 'sensitive-18-plus-document',
    foundIn: ['app/age-verification/page.tsx', 'supabase/migrations/20260517_add_age_verification_documents.sql'],
  },
  {
    table: 'age_verification_requests',
    idFields: ['id'],
    field: 'selfie_path',
    area: 'sensitive-age-verification',
    privacy: 'sensitive',
    referenceKind: 'supabase-storage-path',
    bucket: 'age-verifications',
    risk: 'sensitive-18-plus-selfie',
    foundIn: ['app/age-verification/page.tsx', 'supabase/migrations/20260517_add_age_verification_documents.sql'],
  },
  {
    table: 'parental_consent_requests',
    idFields: ['id'],
    field: 'guardian_selfie_path',
    area: 'sensitive-parental-consent',
    privacy: 'sensitive',
    referenceKind: 'supabase-storage-path',
    bucket: 'age-verifications',
    risk: 'sensitive-guardian-selfie',
    foundIn: ['app/api/parental-consent/respond/route.ts', 'supabase/migrations/20260527_add_parental_consent_guardian_selfie.sql'],
  },
  {
    table: 'itacash_purchase_requests',
    idFields: ['id'],
    field: 'proof_path',
    area: 'sensitive-payment-proofs',
    privacy: 'sensitive',
    referenceKind: 'supabase-storage-path',
    bucket: 'payment-proofs',
    risk: 'sensitive-payment-proof',
    foundIn: ['app/buy-itacash/page.tsx', 'supabase/migrations/20260518_add_pix_proof_to_itacash_purchases.sql'],
  },
  {
    table: 'itacash_purchase_requests',
    idFields: ['id'],
    field: 'proof_url',
    area: 'sensitive-payment-proofs',
    privacy: 'sensitive',
    referenceKind: 'url-or-path',
    bucket: 'payment-proofs',
    risk: 'sensitive-payment-proof-url',
    foundIn: ['supabase/migrations/20260518_create_itacash_purchase_requests.sql'],
  },
]

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return

  const content = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function getPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getPublicHost(value) {
  if (!value || typeof value !== 'string') return null
  try {
    return new URL(value).host.toLowerCase()
  } catch {
    return null
  }
}

function getPublicBaseUrlPath(value) {
  if (!value || typeof value !== 'string') return ''
  try {
    return new URL(value).pathname.replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function getRuntimeConfig() {
  loadEnvFile(path.join(process.cwd(), '.env.local'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const r2PublicBaseUrl =
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_BASE_URL ||
    ''

  return {
    supabaseUrl,
    serviceRoleKey,
    supabaseHost: getPublicHost(supabaseUrl),
    r2PublicHost: getPublicHost(r2PublicBaseUrl),
    r2PublicBasePath: getPublicBaseUrlPath(r2PublicBaseUrl),
    pageSize: getPositiveInteger(process.env.MEDIA_MIGRATION_AUDIT_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    maxRowsPerSource: getPositiveInteger(
      process.env.MEDIA_MIGRATION_AUDIT_MAX_ROWS_PER_SOURCE,
      DEFAULT_MAX_ROWS_PER_SOURCE,
    ),
  }
}

function isLocalPublicPath(value) {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false
  if (trimmed.includes('\\') || trimmed.includes('\0')) return false

  const lower = trimmed.toLowerCase()
  if (lower.startsWith('/storage/v1/')) return false
  return true
}

function isSupabaseStorageReference(lower, config) {
  return (
    lower.includes('supabase.co/storage') ||
    lower.includes('/storage/v1/object/public/') ||
    lower.includes('/storage/v1/object/sign/') ||
    (config.supabaseHost && lower.includes(config.supabaseHost) && lower.includes('/storage/'))
  )
}

function isPrivateMessageR2Reference(raw, source) {
  if (source.area !== 'private-message-attachments') return false

  const key = raw.startsWith('r2://')
    ? raw.slice('r2://'.length).replace(/^\/+/, '')
    : raw.replace(/^\/+/, '')

  return Boolean(
    key.startsWith(PRIVATE_MESSAGE_R2_PREFIX) &&
      !key.includes('..') &&
      !key.includes('\\') &&
      !key.includes('\0') &&
      !key.includes('?') &&
      !key.includes('#'),
  )
}

function isAgeVerificationR2Reference(raw, source) {
  if (source.area !== 'sensitive-age-verification') return false

  const key = raw.startsWith('r2://')
    ? raw.slice('r2://'.length).replace(/^\/+/, '')
    : raw.replace(/^\/+/, '')

  return Boolean(
    key.startsWith(AGE_VERIFICATION_R2_PREFIX) &&
      !key.includes('..') &&
      !key.includes('\\') &&
      !key.includes('\0') &&
      !key.includes('?') &&
      !key.includes('#'),
  )
}

function isR2Reference(raw, lower, config) {
  if (lower.includes('r2.dev')) return true
  if (!config.r2PublicHost) return false

  try {
    const parsed = new URL(raw)
    if (parsed.host.toLowerCase() !== config.r2PublicHost) return false
    if (!config.r2PublicBasePath) return true
    return parsed.pathname === config.r2PublicBasePath || parsed.pathname.startsWith(`${config.r2PublicBasePath}/`)
  } catch {
    return lower.includes(config.r2PublicHost)
  }
}

function classifyReference(value, source, config) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 'empty/null'
  }

  const raw = String(value).trim()
  const lower = raw.toLowerCase()

  if (isPrivateMessageR2Reference(raw, source) || isAgeVerificationR2Reference(raw, source)) {
    return 'cloudflare-r2'
  }

  if (isSupabaseStorageReference(lower, config)) {
    return 'supabase-storage'
  }

  if (isR2Reference(raw, lower, config)) {
    return 'cloudflare-r2'
  }

  if (isLocalPublicPath(raw)) {
    return 'local-public'
  }

  try {
    const parsed = new URL(raw)
    return ['http:', 'https:'].includes(parsed.protocol) ? 'external-url' : 'unknown'
  } catch {
    if (source.referenceKind === 'supabase-storage-path') {
      return 'supabase-storage'
    }
    return 'unknown'
  }
}

function sanitizePublicReference(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (isLocalPublicPath(trimmed)) {
    return trimmed.replace(/[?#].*$/, '').slice(0, 180)
  }

  try {
    const parsed = new URL(trimmed)
    const decodedPath = decodeURIComponent(parsed.pathname)
    const segments = decodedPath.split('/').filter(Boolean)
    const shortenedSegments =
      segments.length > 7
        ? [...segments.slice(0, 4), '...', ...segments.slice(-2)]
        : segments

    return `${parsed.protocol}//${parsed.host}/${shortenedSegments.join('/')}`
  } catch {
    return trimmed.replace(/[?#].*$/, '').slice(0, 180)
  }
}

function maskExample(provider, source) {
  if (provider === 'empty/null') return null
  if (provider === 'cloudflare-r2' && source.area === 'private-message-attachments') {
    return 'r2://private/messages/[redacted]'
  }
  if (provider === 'cloudflare-r2' && source.area === 'sensitive-age-verification') {
    return 'r2://private/age-verifications/[redacted]'
  }
  if (provider === 'cloudflare-r2') return 'r2://[redacted]'
  return `${provider}://[redacted]`
}

function getExampleValue(source, provider, value) {
  if (source.privacy !== 'public') return maskExample(provider, source)
  return sanitizePublicReference(value)
}

function sanitizeErrorMessage(message) {
  return String(message || 'Erro inesperado.')
    .replace(/https?:\/\/[^\s)]+/gi, '[url-redacted]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/\b(token|key|secret|signature|apikey|access_token)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 500)
}

function getFileNameFromPath(pathname) {
  const cleanPath = pathname.split('/').filter(Boolean)
  const lastSegment = cleanPath[cleanPath.length - 1] || 'media'
  return lastSegment
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'media'
}

function getIdentity(row, source) {
  const identity = {}
  for (const idField of source.idFields) {
    identity[idField] = row[idField] ?? null
  }
  return identity
}

function getIdentitySegment(row, source) {
  return source.idFields
    .map((idField) => String(row[idField] || 'unknown'))
    .join('-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 160) || 'unknown'
}

function inferSuggestedR2Key(record, source) {
  if (source.privacy !== 'public') return null

  const value = record[source.field]
  if (typeof value !== 'string' || !value.trim()) return null

  let fileName = 'media'
  try {
    const parsed = new URL(value)
    fileName = getFileNameFromPath(decodeURIComponent(parsed.pathname))
  } catch {
    fileName = getFileNameFromPath(value.replace(/[?#].*$/, ''))
  }

  const areaSegment = source.area.replace(/[^a-zA-Z0-9_-]+/g, '-')
  const tableSegment = source.table.replace(/[^a-zA-Z0-9_-]+/g, '-')
  const fieldSegment = source.field.replace(/[^a-zA-Z0-9_-]+/g, '-')
  const idSegment = getIdentitySegment(record, source)

  return `migrated/${areaSegment}/${tableSegment}/${idSegment}/${fieldSegment}/${fileName}`
}

function makeEmptyClassificationTotals() {
  return CLASSIFICATIONS.reduce((acc, provider) => {
    acc[provider] = 0
    return acc
  }, {})
}

function makeEmptyExamples() {
  return CLASSIFICATIONS.reduce((acc, provider) => {
    acc[provider] = []
    return acc
  }, {})
}

function addExample(summary, provider, value) {
  if (!value || summary.examples[provider].length >= 5) return
  if (summary.examples[provider].includes(value)) return
  summary.examples[provider].push(value)
}

function getSelectFields(source) {
  return [...new Set([...source.idFields, source.field])].join(', ')
}

function makeSourceSummary(source) {
  return {
    table: source.table,
    field: source.field,
    idFields: source.idFields,
    area: source.area,
    privacy: source.privacy,
    referenceKind: source.referenceKind,
    bucket: source.bucket || null,
    risk: source.risk,
    foundIn: source.foundIn,
    scanned: 0,
    truncated: false,
    examplesRedacted: source.privacy !== 'public',
    totals: makeEmptyClassificationTotals(),
    examples: makeEmptyExamples(),
  }
}

function makeRedactedCandidate(source, count) {
  return {
    table: source.table,
    field: source.field,
    area: source.area,
    privacy: source.privacy,
    provider: 'supabase-storage',
    count,
    redacted: true,
    example: 'supabase-storage://[redacted]',
    note: 'Detalhes por linha omitidos para fonte privada ou sensivel.',
  }
}

function makeDetailedCandidate(source, row, sanitized) {
  return {
    table: source.table,
    field: source.field,
    area: source.area,
    privacy: source.privacy,
    identity: getIdentity(row, source),
    provider: 'supabase-storage',
    originalReferenceSanitized: sanitized,
    suggestedR2Key: inferSuggestedR2Key(row, source),
    risk: source.risk,
  }
}

async function auditSource(supabase, source, config, warnings) {
  const summary = makeSourceSummary(source)
  const candidates = []
  let redactedSupabaseStorageCount = 0

  for (let from = 0; from < config.maxRowsPerSource; from += config.pageSize) {
    const to = Math.min(from + config.pageSize - 1, config.maxRowsPerSource - 1)
    const { data, error } = await supabase
      .from(source.table)
      .select(getSelectFields(source))
      .range(from, to)

    if (error) {
      warnings.push({
        table: source.table,
        field: source.field,
        area: source.area,
        privacy: source.privacy,
        message: `Fonte ignorada: ${sanitizeErrorMessage(error.message)}`,
      })
      return { summary, candidates }
    }

    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) break

    for (const row of rows) {
      const provider = classifyReference(row[source.field], source, config)
      const example = getExampleValue(source, provider, row[source.field])

      summary.scanned += 1
      summary.totals[provider] += 1
      addExample(summary, provider, example)

      if (provider === 'supabase-storage') {
        if (source.privacy === 'public') {
          candidates.push(makeDetailedCandidate(source, row, example))
        } else {
          redactedSupabaseStorageCount += 1
        }
      }
    }

    if (rows.length < config.pageSize) break

    if (to >= config.maxRowsPerSource - 1) {
      summary.truncated = true
      warnings.push({
        table: source.table,
        field: source.field,
        area: source.area,
        privacy: source.privacy,
        message: `Leitura limitada a ${config.maxRowsPerSource} linhas. Ajuste MEDIA_MIGRATION_AUDIT_MAX_ROWS_PER_SOURCE para ampliar.`,
      })
    }
  }

  if (redactedSupabaseStorageCount > 0) {
    candidates.push(makeRedactedCandidate(source, redactedSupabaseStorageCount))
  }

  return { summary, candidates }
}

function buildTotals(sources) {
  const byClassification = makeEmptyClassificationTotals()
  const byArea = {}
  let scanned = 0

  for (const source of sources) {
    scanned += source.scanned

    if (!byArea[source.area]) {
      byArea[source.area] = {
        scanned: 0,
        byClassification: makeEmptyClassificationTotals(),
      }
    }

    byArea[source.area].scanned += source.scanned

    for (const provider of CLASSIFICATIONS) {
      const count = source.totals[provider] || 0
      byClassification[provider] += count
      byArea[source.area].byClassification[provider] += count
    }
  }

  return {
    scanned,
    byClassification,
    byArea,
  }
}

function buildCandidateTotals(candidates) {
  return candidates.reduce(
    (acc, candidate) => {
      const count = candidate.count || 1
      acc.supabaseStorage += count
      if (candidate.redacted) {
        acc.redacted += count
      } else {
        acc.detailed += count
      }
      return acc
    },
    { supabaseStorage: 0, detailed: 0, redacted: 0 },
  )
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function makeInitialReport(config, warnings) {
  return {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    safety: {
      updatesDatabase: false,
      uploadsFiles: false,
      deletesFiles: false,
      printsSecrets: false,
    },
    config: {
      pageSize: config.pageSize,
      maxRowsPerSource: config.maxRowsPerSource,
      sourceCount: SOURCES.length,
      hasSupabaseUrl: Boolean(config.supabaseUrl),
      hasServiceRoleKey: Boolean(config.serviceRoleKey),
      hasR2PublicBaseUrl: Boolean(config.r2PublicHost),
      sensitiveAndPrivateExamplesRedacted: true,
    },
    sources: [],
    totals: {
      scanned: 0,
      byClassification: makeEmptyClassificationTotals(),
      byArea: {},
    },
    candidateTotals: {
      supabaseStorage: 0,
      detailed: 0,
      redacted: 0,
    },
    candidates: [],
    warnings,
  }
}

async function main() {
  const config = getRuntimeConfig()
  const warnings = []
  const report = makeInitialReport(config, warnings)

  if (!config.supabaseUrl) {
    warnings.push({ message: 'NEXT_PUBLIC_SUPABASE_URL ausente. Configure o ambiente local antes de rodar a auditoria.' })
  }

  if (!config.serviceRoleKey) {
    warnings.push({ message: 'SUPABASE_SERVICE_ROLE_KEY ausente. A auditoria precisa dela para leitura local completa, mas o valor nunca sera impresso.' })
  }

  if (!config.supabaseUrl || !config.serviceRoleKey) {
    writeReport(report)
    console.log('Dry-run estendido de auditoria de midias/anexos para R2')
    console.log('Status: configuracao incompleta; nenhum dado foi consultado.')
    console.log(`Warnings: ${warnings.length}`)
    console.log(`Relatorio: ${REPORT_PATH}`)
    process.exitCode = 1
    return
  }

  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  for (const source of SOURCES) {
    const { summary, candidates } = await auditSource(supabase, source, config, warnings)
    report.sources.push(summary)
    report.candidates.push(...candidates)
  }

  report.totals = buildTotals(report.sources)
  report.candidateTotals = buildCandidateTotals(report.candidates)

  writeReport(report)

  const byClassification = report.totals.byClassification

  console.log('Dry-run estendido de auditoria de midias/anexos para R2')
  console.log(`Total analisado: ${report.totals.scanned}`)
  console.log(`Candidatos Supabase Storage: ${report.candidateTotals.supabaseStorage}`)
  console.log(`Ja em R2: ${byClassification['cloudflare-r2']}`)
  console.log(`Externos: ${byClassification['external-url']}`)
  console.log(`Local public: ${byClassification['local-public']}`)
  console.log(`Warnings: ${warnings.length}`)
  console.log(`Relatorio: ${REPORT_PATH}`)
}

main().catch((error) => {
  const safeMessage = error instanceof Error ? sanitizeErrorMessage(error.message) : 'Erro inesperado.'
  console.error(`Falha no dry-run estendido: ${safeMessage}`)
  process.exitCode = 1
})

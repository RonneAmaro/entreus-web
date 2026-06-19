#!/usr/bin/env node

/**
 * Dry-run/execute migration for sensitive age verification files.
 *
 * Scope: age_verification_requests.document_front_path,
 * document_back_path, and selfie_path only. Database fields are updated to
 * private R2 keys, never public URLs. Reports redact sensitive paths, file
 * names, request identifiers, and never include signed URLs or secrets.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3')
const { createClient } = require('@supabase/supabase-js')

const DEFAULT_PAGE_SIZE = 500
const DEFAULT_MAX_ROWS_PER_SOURCE = 5000
const DRY_RUN_REPORT_PATH = path.join(process.cwd(), 'reports', 'age-verification-files-migration-dry-run.json')
const EXECUTE_REPORT_PATH = path.join(process.cwd(), 'reports', 'age-verification-files-migration-execute.json')
const SUPABASE_BUCKET_NAME = 'age-verifications'
const R2_PRIVATE_PREFIX = 'private/age-verifications'

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
    table: 'age_verification_requests',
    idField: 'id',
    field: 'document_front_path',
    area: 'sensitive-age-verification',
    privacy: 'sensitive',
    bucket: SUPABASE_BUCKET_NAME,
    r2Prefix: `${R2_PRIVATE_PREFIX}/document-front`,
  },
  {
    table: 'age_verification_requests',
    idField: 'id',
    field: 'document_back_path',
    area: 'sensitive-age-verification',
    privacy: 'sensitive',
    bucket: SUPABASE_BUCKET_NAME,
    r2Prefix: `${R2_PRIVATE_PREFIX}/document-back`,
  },
  {
    table: 'age_verification_requests',
    idField: 'id',
    field: 'selfie_path',
    area: 'sensitive-age-verification',
    privacy: 'sensitive',
    bucket: SUPABASE_BUCKET_NAME,
    r2Prefix: `${R2_PRIVATE_PREFIX}/selfie`,
  },
]

const MIME_TYPE_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

function getMode() {
  const wantsDryRun = process.argv.includes('--dry-run')
  const wantsExecute = process.argv.includes('--execute')

  if (wantsDryRun && wantsExecute) {
    throw new Error('Use apenas --dry-run ou --execute.')
  }

  return wantsExecute ? 'execute' : 'dry-run'
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return

  const content = fs.readFileSync(filePath, 'utf8')
  const parsedEnv = {}

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

    parsedEnv[key] = value
  }

  for (const [key, value] of Object.entries(parsedEnv)) {
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

function getR2BucketName() {
  return (
    process.env.R2_AGE_VERIFICATION_BUCKET_NAME ||
    process.env.R2_PRIVATE_BUCKET_NAME ||
    process.env.R2_BUCKET_NAME ||
    ''
  )
}

function getRuntimeConfig() {
  loadEnvFile(path.join(process.cwd(), '.env.local'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const r2PublicBaseUrl =
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_BASE_URL ||
    ''

  return {
    supabaseUrl,
    supabaseAnonKey,
    serviceRoleKey,
    supabaseHost: getPublicHost(supabaseUrl),
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2BucketName: getR2BucketName(),
    r2PublicHost: getPublicHost(r2PublicBaseUrl),
    r2PublicBasePath: getPublicBaseUrlPath(r2PublicBaseUrl),
    adminAccessToken: process.env.AGE_VERIFICATION_MIGRATION_ADMIN_ACCESS_TOKEN || '',
    pageSize: getPositiveInteger(process.env.AGE_VERIFICATION_FILES_MIGRATION_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    maxRowsPerSource: getPositiveInteger(
      process.env.AGE_VERIFICATION_FILES_MIGRATION_MAX_ROWS_PER_SOURCE,
      DEFAULT_MAX_ROWS_PER_SOURCE,
    ),
  }
}

function getSafeConfig(config) {
  return {
    pageSize: config.pageSize,
    maxRowsPerSource: config.maxRowsPerSource,
    sourceCount: SOURCES.length,
    hasSupabaseUrl: Boolean(config.supabaseUrl),
    hasSupabaseAnonKey: Boolean(config.supabaseAnonKey),
    hasServiceRoleKey: Boolean(config.serviceRoleKey),
    hasR2AccountId: Boolean(config.r2AccountId),
    hasR2AccessKeyId: Boolean(config.r2AccessKeyId),
    hasR2SecretAccessKey: Boolean(config.r2SecretAccessKey),
    hasR2BucketName: Boolean(config.r2BucketName),
    hasR2PublicBaseUrl: Boolean(config.r2PublicHost),
    supportsPrivateBucketOverride: true,
  }
}

function hasR2WriteConfig(config) {
  return Boolean(
    config.r2AccountId &&
      config.r2AccessKeyId &&
      config.r2SecretAccessKey &&
      config.r2BucketName,
  )
}

function sanitizeErrorMessage(message) {
  return String(message || 'Erro inesperado.')
    .replace(/https?:\/\/[^\s)]+/gi, '[url-redacted]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/\b(token|key|secret|signature|apikey|access_token)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '[uuid-redacted]')
    .slice(0, 500)
}

function isSafeObjectPath(value) {
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

function normalizeR2AgeVerificationKey(value) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  const key = trimmed.startsWith('r2://')
    ? trimmed.slice('r2://'.length).replace(/^\/+/, '')
    : trimmed.replace(/^\/+/, '')

  if (!key.startsWith(`${R2_PRIVATE_PREFIX}/`)) return null
  if (!isSafeObjectPath(key)) return null

  return key
}

function isLocalPublicPath(value) {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false
  if (trimmed.includes('\\') || trimmed.includes('\0')) return false
  return !trimmed.toLowerCase().startsWith('/storage/v1/')
}

function isSupabaseStorageReference(lower, config) {
  return (
    lower.includes('supabase.co/storage') ||
    lower.includes('/storage/v1/object/public/') ||
    lower.includes('/storage/v1/object/sign/') ||
    (config.supabaseHost && lower.includes(config.supabaseHost) && lower.includes('/storage/'))
  )
}

function isR2PublicReference(raw, lower, config) {
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

function classifyReference(value, config) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 'empty/null'
  }

  const raw = String(value).trim()
  const lower = raw.toLowerCase()

  if (normalizeR2AgeVerificationKey(raw)) return 'cloudflare-r2'
  if (isSupabaseStorageReference(lower, config)) return 'supabase-storage'
  if (isR2PublicReference(raw, lower, config)) return 'cloudflare-r2'
  if (isLocalPublicPath(raw)) return 'local-public'

  try {
    const parsed = new URL(raw)
    return ['http:', 'https:'].includes(parsed.protocol) ? 'external-url' : 'unknown'
  } catch {
    return isSafeObjectPath(raw.replace(/^\/+/, '')) ? 'supabase-storage' : 'unknown'
  }
}

function maskExample(provider) {
  if (provider === 'empty/null') return null
  if (provider === 'cloudflare-r2') return 'r2://private/age-verifications/[redacted]'
  if (provider === 'supabase-storage') return 'supabase-storage://[redacted-age-verification]'
  return `${provider}://[redacted-age-verification]`
}

function makeEmptyTotals() {
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

function parseSupabaseStorageReference(value) {
  if (typeof value !== 'string' || !value.trim()) return null

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

    if (bucket !== SUPABASE_BUCKET_NAME || !isSafeObjectPath(objectPath)) return null

    return {
      bucket,
      objectPath,
    }
  } catch {
    const objectPath = raw.replace(/^\/+/, '')
    if (!isSafeObjectPath(objectPath)) return null
    return {
      bucket: SUPABASE_BUCKET_NAME,
      objectPath,
    }
  }
}

function getExtensionFromPath(pathname) {
  const cleanName = String(pathname || '').split('/').filter(Boolean).pop() || ''
  const extension = cleanName.toLowerCase().replace(/[?#].*$/, '').split('.').pop()
  if (!extension || extension === cleanName.toLowerCase()) return 'bin'
  return extension.replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'bin'
}

function inferContentType(extension, fallback) {
  if (fallback && typeof fallback === 'string' && fallback !== 'application/octet-stream') return fallback
  return MIME_TYPE_BY_EXTENSION[extension] || fallback || 'application/octet-stream'
}

function safeSegment(value, fallback = 'unknown') {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || fallback
}

function getFieldSegment(field) {
  return field
    .replace(/_path$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
}

function buildR2Key(candidate) {
  const extension = getExtensionFromPath(candidate.parsedStorage?.objectPath || candidate.originalReference)
  const hash = crypto
    .createHash('sha256')
    .update(`${candidate.source.table}:${candidate.row.id}:${candidate.source.field}:${candidate.originalReference}`)
    .digest('hex')
    .slice(0, 16)

  return [
    R2_PRIVATE_PREFIX,
    safeSegment(candidate.row.id),
    getFieldSegment(candidate.source.field),
    `migrated-${hash}.${extension}`,
  ].join('/')
}

function makeSourceSummary(source) {
  return {
    table: source.table,
    field: source.field,
    area: source.area,
    privacy: source.privacy,
    bucket: source.bucket,
    scanned: 0,
    truncated: false,
    examplesRedacted: true,
    totals: makeEmptyTotals(),
    examples: makeEmptyExamples(),
  }
}

function getSelectFields(source) {
  return [source.idField, source.field].join(', ')
}

async function auditSource(supabase, source, config, warnings) {
  const summary = makeSourceSummary(source)
  const candidates = []

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
        status: 'source-skipped',
        classification: 'unknown',
        message: `Fonte ignorada: ${sanitizeErrorMessage(error.message)}`,
      })
      return { summary, candidates }
    }

    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) break

    for (const row of rows) {
      const originalReference = row[source.field]
      const classification = classifyReference(originalReference, config)

      summary.scanned += 1
      summary.totals[classification] += 1
      addExample(summary, classification, maskExample(classification))

      if (classification !== 'supabase-storage') continue

      const parsedStorage = parseSupabaseStorageReference(originalReference)
      if (!parsedStorage) {
        warnings.push({
          table: source.table,
          field: source.field,
          area: source.area,
          status: 'candidate-skipped',
          classification,
          message: 'Referencia Supabase Storage ignorada por formato invalido ou bucket inesperado.',
        })
        continue
      }

      const candidate = {
        source,
        row,
        originalReference,
        parsedStorage,
        r2Key: null,
      }

      candidate.r2Key = buildR2Key(candidate)
      candidates.push(candidate)
    }

    if (rows.length < config.pageSize) break

    if (to >= config.maxRowsPerSource - 1) {
      summary.truncated = true
      warnings.push({
        table: source.table,
        field: source.field,
        area: source.area,
        status: 'source-truncated',
        classification: 'unknown',
        message: `Leitura limitada a ${config.maxRowsPerSource} linhas. Ajuste AGE_VERIFICATION_FILES_MIGRATION_MAX_ROWS_PER_SOURCE para ampliar.`,
      })
    }
  }

  return { summary, candidates }
}

function buildTotals(sources) {
  const byClassification = makeEmptyTotals()
  const byField = {}
  const byArea = {}
  let scanned = 0

  for (const source of sources) {
    const fieldKey = `${source.table}.${source.field}`
    scanned += source.scanned

    byField[fieldKey] = {
      scanned: source.scanned,
      byClassification: { ...source.totals },
    }

    if (!byArea[source.area]) {
      byArea[source.area] = {
        scanned: 0,
        byClassification: makeEmptyTotals(),
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
    byField,
    byArea,
  }
}

async function auditAgeVerificationFiles(supabase, config, warnings) {
  const sources = []
  const candidates = []

  for (const source of SOURCES) {
    const result = await auditSource(supabase, source, config, warnings)
    sources.push(result.summary)
    candidates.push(...result.candidates)
  }

  return {
    sources,
    totals: buildTotals(sources),
    candidates,
  }
}

function summarizeCandidatesByField(candidates) {
  const byField = new Map()

  for (const candidate of candidates) {
    const key = `${candidate.source.table}.${candidate.source.field}`
    byField.set(key, (byField.get(key) || 0) + 1)
  }

  return Array.from(byField.entries()).map(([fieldKey, count]) => {
    const [table, field] = fieldKey.split('.')
    return {
      area: 'sensitive-age-verification',
      table,
      field,
      status: 'candidate',
      classification: 'supabase-storage',
      count,
      sourceBucket: SUPABASE_BUCKET_NAME,
      plannedR2Reference: 'r2://private/age-verifications/[redacted]',
    }
  })
}

function getR2Client(config) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  })
}

async function objectExistsInR2(client, config, key) {
  try {
    await client.send(new HeadObjectCommand({
      Bucket: config.r2BucketName,
      Key: key,
    }))
    return true
  } catch (error) {
    const statusCode = error && typeof error === 'object' ? error.$metadata?.httpStatusCode : null
    const name = error && typeof error === 'object' ? error.name : ''
    if (statusCode === 404 || name === 'NotFound' || name === 'NoSuchKey') return false
    throw error
  }
}

async function downloadSupabaseObject(supabase, candidate) {
  const { data, error } = await supabase.storage
    .from(candidate.parsedStorage.bucket)
    .download(candidate.parsedStorage.objectPath)

  if (error) {
    throw new Error(`Download Supabase falhou: ${error.message}`)
  }

  if (!data) {
    throw new Error('Download Supabase retornou vazio.')
  }

  const buffer = Buffer.from(await data.arrayBuffer())
  const extension = getExtensionFromPath(candidate.parsedStorage.objectPath)
  const contentType = inferContentType(extension, data.type)

  return {
    buffer,
    contentType,
  }
}

async function uploadToR2(client, config, candidate, file) {
  await client.send(new PutObjectCommand({
    Bucket: config.r2BucketName,
    Key: candidate.r2Key,
    Body: file.buffer,
    ContentType: file.contentType,
    CacheControl: 'private, max-age=0, no-store',
    Metadata: {
      area: 'sensitive-age-verification',
      privacy: 'sensitive',
      field: candidate.source.field.replace(/[^a-zA-Z0-9_-]+/g, '-'),
    },
  }))
}

async function loadCurrentField(supabase, candidate) {
  const { data, error } = await supabase
    .from(candidate.source.table)
    .select(`${candidate.source.idField}, ${candidate.source.field}`)
    .eq(candidate.source.idField, candidate.row[candidate.source.idField])
    .maybeSingle()

  if (error) {
    throw new Error(`Leitura de seguranca falhou: ${error.message}`)
  }

  return data
}

async function updateDatabaseField(updateSupabase, candidate, config) {
  const currentRow = await loadCurrentField(updateSupabase, candidate)

  if (!currentRow) {
    throw new Error(`Linha nao encontrada em ${candidate.source.table}.${candidate.source.idField}.`)
  }

  const currentValue = currentRow[candidate.source.field]
  const currentProvider = classifyReference(currentValue, config)

  if (normalizeR2AgeVerificationKey(currentValue) === candidate.r2Key || currentProvider === 'cloudflare-r2') {
    return {
      status: 'already-in-r2',
      updatedDatabase: false,
      alreadyInDatabase: true,
      currentProvider,
    }
  }

  if (currentValue !== candidate.originalReference) {
    throw new Error(`Campo atual mudou antes da migracao; classificacao atual: ${currentProvider}.`)
  }

  const { data: updatedData, error: updateError } = await updateSupabase
    .from(candidate.source.table)
    .update({ [candidate.source.field]: candidate.r2Key })
    .eq(candidate.source.idField, candidate.row[candidate.source.idField])
    .eq(candidate.source.field, candidate.originalReference)
    .select(`${candidate.source.idField}, ${candidate.source.field}`)
    .maybeSingle()

  if (updateError) {
    throw new Error(`Update do banco falhou: ${updateError.message}`)
  }

  if (updatedData?.[candidate.source.field] === candidate.r2Key) {
    return {
      status: 'updated',
      updatedDatabase: true,
      alreadyInDatabase: false,
      currentProvider,
    }
  }

  const updatedRow = await loadCurrentField(updateSupabase, candidate)

  if (updatedRow?.[candidate.source.field] === candidate.r2Key) {
    return {
      status: 'updated',
      updatedDatabase: true,
      alreadyInDatabase: false,
      currentProvider,
    }
  }

  if (!updatedData) {
    const currentAfterProvider = updatedRow
      ? classifyReference(updatedRow[candidate.source.field], config)
      : 'missing-row'
    throw new Error(`Update do banco afetou 0 linhas; classificacao atual apos tentativa: ${currentAfterProvider}.`)
  }

  throw new Error('Update do banco retornou linha, mas o campo nao foi confirmado com a key R2.')
}

function makeOperationBase(candidate) {
  return {
    area: candidate.source.area,
    table: candidate.source.table,
    field: candidate.source.field,
    status: 'pending',
    classificationBefore: 'supabase-storage',
    classificationAfter: null,
    sourceBucket: SUPABASE_BUCKET_NAME,
    plannedR2Reference: 'r2://private/age-verifications/[redacted]',
    downloadedFromSupabase: false,
    alreadyHandled: false,
    uploadedToR2: false,
    r2ObjectAlreadyExisted: false,
    alreadyExisted: false,
    r2ObjectConfirmed: false,
    updatedDatabase: false,
    alreadyInDatabase: false,
    failed: false,
    warning: null,
  }
}

async function runMigrationOperations(supabase, updateSupabase, config, candidates, warnings) {
  const client = getR2Client(config)
  const operations = []

  for (const candidate of candidates) {
    const operation = makeOperationBase(candidate)

    try {
      const currentRow = await loadCurrentField(supabase, candidate)
      if (!currentRow) {
        throw new Error(`Linha nao encontrada em ${candidate.source.table}.${candidate.source.idField}.`)
      }

      const currentValue = currentRow[candidate.source.field]
      const currentProvider = classifyReference(currentValue, config)

      if (normalizeR2AgeVerificationKey(currentValue) === candidate.r2Key || currentProvider === 'cloudflare-r2') {
        operation.status = 'already-in-r2'
        operation.alreadyHandled = true
        operation.alreadyInDatabase = true
        operation.classificationAfter = 'cloudflare-r2'
        operations.push(operation)
        continue
      }

      if (currentValue !== candidate.originalReference) {
        throw new Error(`Campo atual mudou antes da migracao; classificacao atual: ${currentProvider}.`)
      }

      const existedBefore = await objectExistsInR2(client, config, candidate.r2Key)

      if (existedBefore) {
        operation.status = 'r2-object-already-existed'
        operation.r2ObjectAlreadyExisted = true
        operation.alreadyExisted = true
        operation.alreadyHandled = true
        operation.r2ObjectConfirmed = true
      } else {
        const file = await downloadSupabaseObject(supabase, candidate)
        operation.downloadedFromSupabase = true
        await uploadToR2(client, config, candidate, file)
        operation.uploadedToR2 = true
        operation.r2ObjectConfirmed = await objectExistsInR2(client, config, candidate.r2Key)

        if (!operation.r2ObjectConfirmed) {
          throw new Error('Upload enviado, mas o objeto nao foi confirmado no R2.')
        }
      }

      const updateResult = await updateDatabaseField(updateSupabase, candidate, config)
      operation.updatedDatabase = updateResult.updatedDatabase
      operation.alreadyInDatabase = updateResult.alreadyInDatabase
      operation.classificationAfter = 'cloudflare-r2'

      if (updateResult.status === 'already-in-r2') {
        operation.status = 'already-in-r2'
        operation.alreadyHandled = true
      } else {
        operation.status = operation.r2ObjectAlreadyExisted
          ? 'updated-existing-r2-object'
          : 'uploaded-and-updated'
      }
    } catch (error) {
      operation.status = 'failed'
      operation.failed = true
      operation.warning = sanitizeErrorMessage(error instanceof Error ? error.message : 'Erro inesperado.')
      warnings.push({
        area: candidate.source.area,
        table: candidate.source.table,
        field: candidate.source.field,
        status: operation.status,
        classification: operation.classificationBefore,
        message: operation.warning,
      })
    }

    operations.push(operation)
  }

  return operations
}

function summarizeOperations(operations) {
  return operations.reduce(
    (acc, operation) => {
      acc.attempted += 1
      if (operation.downloadedFromSupabase) acc.downloadedFromSupabase += 1
      if (operation.alreadyHandled) acc.alreadyHandled += 1
      if (operation.uploadedToR2) acc.uploadedToR2 += 1
      if (operation.r2ObjectAlreadyExisted) acc.r2ObjectAlreadyExisted += 1
      if (operation.alreadyExisted) acc.alreadyExisted += 1
      if (operation.r2ObjectConfirmed) acc.r2ObjectConfirmed += 1
      if (operation.updatedDatabase) acc.updatedDatabase += 1
      if (operation.alreadyInDatabase) acc.alreadyInDatabase += 1
      if (operation.status === 'failed') acc.failed += 1
      return acc
    },
    {
      attempted: 0,
      downloadedFromSupabase: 0,
      alreadyHandled: 0,
      uploadedToR2: 0,
      r2ObjectAlreadyExisted: 0,
      alreadyExisted: 0,
      r2ObjectConfirmed: 0,
      updatedDatabase: 0,
      alreadyInDatabase: 0,
      failed: 0,
    },
  )
}

function makeBaseReport(mode, config, warnings) {
  const executeMode = mode === 'execute'

  return {
    generatedAt: new Date().toISOString(),
    mode,
    dryRun: !executeMode,
    safety: {
      updatesDatabase: executeMode,
      uploadsFiles: executeMode,
      downloadsFiles: executeMode,
      deletesFiles: false,
      printsSecrets: false,
      storesPublicUrlForSensitiveFile: false,
      scope: 'sensitive-age-verification',
    },
    config: getSafeConfig(config),
    sources: SOURCES.map((source) => ({
      table: source.table,
      field: source.field,
      area: source.area,
      bucket: source.bucket,
      r2Prefix: source.r2Prefix,
    })),
    before: null,
    after: null,
    candidates: [],
    operations: [],
    operationTotals: {
      attempted: 0,
      downloadedFromSupabase: 0,
      alreadyHandled: 0,
      uploadedToR2: 0,
      r2ObjectAlreadyExisted: 0,
      alreadyExisted: 0,
      r2ObjectConfirmed: 0,
      updatedDatabase: 0,
      alreadyInDatabase: 0,
      failed: 0,
    },
    warnings,
  }
}

function writeReport(report, mode) {
  const reportPath = mode === 'execute' ? EXECUTE_REPORT_PATH : DRY_RUN_REPORT_PATH
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return reportPath
}

function printSummary(report, reportPath) {
  const totals = report.before?.totals?.byClassification || makeEmptyTotals()

  console.log(`Age verification files migration ${report.mode}`)
  console.log(`Total analisado: ${report.before?.totals?.scanned || 0}`)
  console.log(`Candidatos Supabase Storage: ${totals['supabase-storage'] || 0}`)
  console.log(`Ja em R2 protegido: ${totals['cloudflare-r2'] || 0}`)
  console.log(`Externos: ${totals['external-url'] || 0}`)
  console.log(`Local public: ${totals['local-public'] || 0}`)

  if (report.mode === 'execute') {
    console.log(`Tentativas: ${report.operationTotals.attempted}`)
    console.log(`Downloads Supabase: ${report.operationTotals.downloadedFromSupabase}`)
    console.log(`Ja tratados: ${report.operationTotals.alreadyHandled}`)
    console.log(`Uploads R2: ${report.operationTotals.uploadedToR2}`)
    console.log(`Objetos R2 ja existentes: ${report.operationTotals.r2ObjectAlreadyExisted}`)
    console.log(`Objetos R2 confirmados: ${report.operationTotals.r2ObjectConfirmed}`)
    console.log(`Updates no banco: ${report.operationTotals.updatedDatabase}`)
    console.log(`Campos ja em R2: ${report.operationTotals.alreadyInDatabase}`)
    console.log(`Falhas: ${report.operationTotals.failed}`)
  }

  console.log(`Warnings: ${report.warnings.length}`)
  console.log(`Relatorio: ${reportPath}`)
}

async function getAdminProfileId(supabase) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Nao foi possivel localizar perfil admin: ${error.message}`)
  }

  if (!data?.id) {
    throw new Error('Nenhum perfil admin encontrado para validar updates sensiveis.')
  }

  return data.id
}

async function findAuthUserEmailById(supabase, userId) {
  let page = 1
  const perPage = 1000

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })

    if (error) {
      throw new Error(`Nao foi possivel localizar usuario admin: ${error.message}`)
    }

    const users = data?.users || []
    const user = users.find((item) => item.id === userId)

    if (user?.email) return user.email
    if (users.length < perPage) break

    page += 1
  }

  throw new Error('Usuario admin encontrado em profiles nao possui email localizavel no Auth.')
}

async function getAdminAccessTokenFromGeneratedLink(serviceSupabase, config) {
  const adminProfileId = await getAdminProfileId(serviceSupabase)
  const adminEmail = await findAuthUserEmailById(serviceSupabase, adminProfileId)

  const { data: linkData, error: linkError } = await serviceSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: adminEmail,
  })

  if (linkError) {
    throw new Error(`Nao foi possivel gerar sessao admin temporaria: ${linkError.message}`)
  }

  const tokenHash = linkData?.properties?.hashed_token
  if (!tokenHash) {
    throw new Error('Sessao admin temporaria nao retornou token verificavel.')
  }

  const authClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: sessionData, error: verifyError } = await authClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })

  if (verifyError || !sessionData?.session?.access_token) {
    throw new Error(`Nao foi possivel validar sessao admin temporaria: ${verifyError?.message || 'sessao ausente'}`)
  }

  return {
    accessToken: sessionData.session.access_token,
    cleanup: async () => {
      await authClient.auth.signOut().catch(() => {})
    },
  }
}

async function getAdminUpdateClient(serviceSupabase, config) {
  let accessToken = config.adminAccessToken
  let cleanup = async () => {}

  if (!accessToken) {
    const generated = await getAdminAccessTokenFromGeneratedLink(serviceSupabase, config)
    accessToken = generated.accessToken
    cleanup = generated.cleanup
  }

  const updateSupabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await updateSupabase.auth.getUser()

  if (userError || !user) {
    throw new Error('Token admin para migracao nao foi aceito pelo Supabase Auth.')
  }

  const { data: profile, error: profileError } = await updateSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || profile?.role !== 'admin') {
    throw new Error('Token admin para migracao nao pertence a um perfil admin.')
  }

  return {
    client: updateSupabase,
    cleanup,
  }
}

async function main() {
  const mode = getMode()
  const config = getRuntimeConfig()
  const warnings = []
  const report = makeBaseReport(mode, config, warnings)

  if (!config.supabaseUrl) {
    warnings.push({ message: 'NEXT_PUBLIC_SUPABASE_URL ausente. Configure o ambiente local antes de rodar a migracao.' })
  }

  if (mode === 'execute' && !config.supabaseAnonKey) {
    warnings.push({ message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY ausente. Execute precisa dela para validar o contexto admin de update, mas o valor nunca sera impresso.' })
  }

  if (!config.serviceRoleKey) {
    warnings.push({ message: 'SUPABASE_SERVICE_ROLE_KEY ausente. A migracao precisa dela para leitura/update controlado, mas o valor nunca sera impresso.' })
  }

  if (mode === 'execute' && !hasR2WriteConfig(config)) {
    warnings.push({ message: 'Configuracao R2 incompleta. Execute bloqueado antes de qualquer download, upload ou update.' })
  }

  if (
    !config.supabaseUrl ||
    !config.serviceRoleKey ||
    (mode === 'execute' && (!config.supabaseAnonKey || !hasR2WriteConfig(config)))
  ) {
    const reportPath = writeReport(report, mode)
    printSummary(report, reportPath)
    process.exitCode = 1
    return
  }

  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const before = await auditAgeVerificationFiles(supabase, config, warnings)
  report.before = {
    sources: before.sources,
    totals: before.totals,
  }
  report.candidates = summarizeCandidatesByField(before.candidates)

  if (mode === 'execute') {
    const adminUpdate = await getAdminUpdateClient(supabase, config)

    try {
      report.operations = await runMigrationOperations(supabase, adminUpdate.client, config, before.candidates, warnings)
      report.operationTotals = summarizeOperations(report.operations)
    } finally {
      await adminUpdate.cleanup()
    }

    const after = await auditAgeVerificationFiles(supabase, config, warnings)
    report.after = {
      sources: after.sources,
      totals: after.totals,
      candidates: summarizeCandidatesByField(after.candidates),
    }
  }

  const reportPath = writeReport(report, mode)
  printSummary(report, reportPath)
}

main().catch((error) => {
  const safeMessage = error instanceof Error ? sanitizeErrorMessage(error.message) : 'Erro inesperado.'
  console.error(`Falha na migracao de arquivos de verificacao de idade: ${safeMessage}`)
  process.exitCode = 1
})

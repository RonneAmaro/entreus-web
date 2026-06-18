#!/usr/bin/env node

/**
 * Dry-run/execute migration for public profile avatars and banners.
 *
 * Dry-run only reads profile rows and writes a local JSON report.
 * Execute downloads only Supabase Storage avatar/banner candidates, uploads
 * them to R2, confirms the R2 object exists, and then updates only the
 * matching profile field. It never deletes Supabase or R2 objects.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3')
const { createClient } = require('@supabase/supabase-js')

const DEFAULT_PAGE_SIZE = 500
const DEFAULT_MAX_ROWS_PER_SOURCE = 5000
const DRY_RUN_REPORT_PATH = path.join(process.cwd(), 'reports', 'profile-media-migration-dry-run.json')
const EXECUTE_REPORT_PATH = path.join(process.cwd(), 'reports', 'profile-media-migration-execute.json')
const REPAIR_DB_REPORT_PATH = path.join(process.cwd(), 'reports', 'profile-media-migration-repair-db.json')
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
    table: 'profiles',
    idField: 'id',
    field: 'avatar_url',
    expectedBuckets: ['avatars'],
    r2Prefix: 'profiles/avatars',
    label: 'profile-avatar',
  },
  {
    table: 'profiles',
    idField: 'id',
    field: 'banner_url',
    expectedBuckets: ['profile-banners'],
    r2Prefix: 'profiles/banners',
    label: 'profile-banner',
  },
]

const MIME_TYPE_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

function getMode() {
  const wantsDryRun = process.argv.includes('--dry-run')
  const wantsExecute = process.argv.includes('--execute')
  const wantsRepairDb = process.argv.includes('--repair-db')
  const selectedModes = [wantsDryRun, wantsExecute, wantsRepairDb].filter(Boolean).length

  if (selectedModes > 1) {
    throw new Error('Use apenas --dry-run, --execute ou --repair-db.')
  }

  if (wantsRepairDb) return 'repair-db'
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
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2BucketName: process.env.R2_BUCKET_NAME || '',
    r2PublicBaseUrl,
    r2PublicHost: getPublicHost(r2PublicBaseUrl),
    r2PublicBasePath: getPublicBaseUrlPath(r2PublicBaseUrl),
    pageSize: getPositiveInteger(process.env.PROFILE_MEDIA_MIGRATION_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    maxRowsPerSource: getPositiveInteger(
      process.env.PROFILE_MEDIA_MIGRATION_MAX_ROWS_PER_SOURCE,
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
    hasServiceRoleKey: Boolean(config.serviceRoleKey),
    hasR2AccountId: Boolean(config.r2AccountId),
    hasR2AccessKeyId: Boolean(config.r2AccessKeyId),
    hasR2SecretAccessKey: Boolean(config.r2SecretAccessKey),
    hasR2BucketName: Boolean(config.r2BucketName),
    hasR2PublicBaseUrl: Boolean(config.r2PublicHost),
  }
}

function hasR2WriteConfig(config) {
  return Boolean(
    config.r2AccountId &&
      config.r2AccessKeyId &&
      config.r2SecretAccessKey &&
      config.r2BucketName &&
      config.r2PublicBaseUrl,
  )
}

function sanitizeErrorMessage(message) {
  return String(message || 'Erro inesperado.')
    .replace(/https?:\/\/[^\s)]+/gi, '[url-redacted]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/\b(token|key|secret|signature|apikey|access_token)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 500)
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

function classifyReference(value, config) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 'empty/null'
  }

  const raw = String(value).trim()
  const lower = raw.toLowerCase()

  if (isSupabaseStorageReference(lower, config)) return 'supabase-storage'
  if (isR2Reference(raw, lower, config)) return 'cloudflare-r2'
  if (isLocalPublicPath(raw)) return 'local-public'

  try {
    const parsed = new URL(raw)
    return ['http:', 'https:'].includes(parsed.protocol) ? 'external-url' : 'unknown'
  } catch {
    return 'unknown'
  }
}

function sanitizeReference(value) {
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

function parseSupabaseStorageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const parsed = new URL(value.trim())
    const pathname = decodeURIComponent(parsed.pathname)
    const marker = '/storage/v1/object/'
    const markerIndex = pathname.indexOf(marker)

    if (markerIndex === -1) return null

    const rest = pathname.slice(markerIndex + marker.length)
    const segments = rest.split('/').filter(Boolean)

    if (segments.length < 3) return null

    const accessType = segments.shift()
    const bucket = segments.shift()
    const objectPath = segments.join('/')

    if (!accessType || !bucket || !objectPath) return null
    if (objectPath.includes('..') || objectPath.includes('\\')) return null

    return {
      accessType,
      bucket,
      objectPath,
    }
  } catch {
    return null
  }
}

function getFileNameFromPath(pathname) {
  const cleanPath = String(pathname || '').split('/').filter(Boolean)
  const lastSegment = cleanPath[cleanPath.length - 1] || 'profile-media'
  return lastSegment
    .replace(/[?#].*$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'profile-media'
}

function getExtensionFromName(fileName) {
  const extension = fileName.toLowerCase().split('.').pop()
  return extension && extension !== fileName.toLowerCase() ? extension : ''
}

function inferContentType(fileName, fallback) {
  if (fallback && typeof fallback === 'string') return fallback
  const extension = getExtensionFromName(fileName)
  return MIME_TYPE_BY_EXTENSION[extension] || 'application/octet-stream'
}

function buildR2Key(row, source, parsedStorage) {
  const fileName = getFileNameFromPath(parsedStorage?.objectPath || row[source.field] || 'profile-media')
  const rowIdentifier = getRowIdentifier({ row, source })
  const hash = crypto
    .createHash('sha256')
    .update(`${rowIdentifier.value}:${source.field}:${row[source.field]}`)
    .digest('hex')
    .slice(0, 16)

  return `${source.r2Prefix}/${rowIdentifier.value}/migrated-${hash}-${fileName}`
}

function buildPublicUrl(config, key) {
  return `${config.r2PublicBaseUrl.replace(/\/+$/, '')}/${key}`
}

function getRowIdentifier(candidate) {
  return {
    column: candidate.source.idField,
    value: candidate.row[candidate.source.idField],
  }
}

function makeSourceSummary(source) {
  return {
    table: source.table,
    field: source.field,
    scanned: 0,
    truncated: false,
    totals: makeEmptyTotals(),
    examples: makeEmptyExamples(),
  }
}

function getCandidateReportItem(candidate) {
  const rowIdentifier = getRowIdentifier(candidate)

  return {
    table: candidate.source.table,
    field: candidate.source.field,
    profileId: rowIdentifier.value,
    rowIdentifier,
    provider: 'supabase-storage',
    originalUrlSanitized: sanitizeReference(candidate.originalUrl),
    sourceBucket: candidate.parsedStorage?.bucket || null,
    sourceObjectPathSanitized: candidate.parsedStorage
      ? getFileNameFromPath(candidate.parsedStorage.objectPath)
      : null,
    plannedR2Prefix: candidate.source.r2Prefix,
    plannedR2Reference: `r2://${candidate.source.r2Prefix}/[redacted]`,
  }
}

async function auditSource(supabase, source, config, warnings) {
  const summary = makeSourceSummary(source)
  const candidates = []

  for (let from = 0; from < config.maxRowsPerSource; from += config.pageSize) {
    const to = Math.min(from + config.pageSize - 1, config.maxRowsPerSource - 1)
    const { data, error } = await supabase
      .from(source.table)
      .select(`${source.idField}, ${source.field}`)
      .range(from, to)

    if (error) {
      warnings.push({
        table: source.table,
        field: source.field,
        message: `Fonte ignorada: ${sanitizeErrorMessage(error.message)}`,
      })
      return { summary, candidates }
    }

    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) break

    for (const row of rows) {
      const originalUrl = row[source.field]
      const provider = classifyReference(originalUrl, config)

      summary.scanned += 1
      summary.totals[provider] += 1
      addExample(summary, provider, sanitizeReference(originalUrl))

      if (provider !== 'supabase-storage') continue

      const parsedStorage = parseSupabaseStorageUrl(originalUrl)
      const r2Key = buildR2Key(row, source, parsedStorage)

      candidates.push({
        source,
        row,
        originalUrl,
        parsedStorage,
        r2Key,
        r2PublicUrl: buildPublicUrl(config, r2Key),
      })
    }

    if (rows.length < config.pageSize) break

    if (to >= config.maxRowsPerSource - 1) {
      summary.truncated = true
      warnings.push({
        table: source.table,
        field: source.field,
        message: `Leitura limitada a ${config.maxRowsPerSource} linhas. Ajuste PROFILE_MEDIA_MIGRATION_MAX_ROWS_PER_SOURCE para ampliar.`,
      })
    }
  }

  return { summary, candidates }
}

function buildTotals(sources) {
  const byClassification = makeEmptyTotals()
  const byField = {}
  let scanned = 0

  for (const source of sources) {
    const fieldKey = `${source.table}.${source.field}`
    scanned += source.scanned
    byField[fieldKey] = {
      scanned: source.scanned,
      byClassification: { ...source.totals },
    }

    for (const provider of CLASSIFICATIONS) {
      byClassification[provider] += source.totals[provider] || 0
    }
  }

  return {
    scanned,
    byClassification,
    byField,
  }
}

async function auditProfileMedia(supabase, config, warnings) {
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
  const parsed = candidate.parsedStorage
  if (!parsed) {
    throw new Error('Nao foi possivel identificar bucket/caminho do Supabase Storage.')
  }

  if (!candidate.source.expectedBuckets.includes(parsed.bucket)) {
    throw new Error(`Bucket inesperado para ${candidate.source.field}.`)
  }

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .download(parsed.objectPath)

  if (error) {
    throw new Error(`Download Supabase falhou: ${error.message}`)
  }

  if (!data) {
    throw new Error('Download Supabase retornou vazio.')
  }

  const buffer = Buffer.from(await data.arrayBuffer())
  const fileName = getFileNameFromPath(parsed.objectPath)
  const contentType = inferContentType(fileName, data.type)

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
    CacheControl: 'public, max-age=31536000, immutable',
  }))
}

async function loadCurrentProfileField(supabase, candidate) {
  const rowIdentifier = getRowIdentifier(candidate)
  const { data, error } = await supabase
    .from(candidate.source.table)
    .select(`${rowIdentifier.column}, ${candidate.source.field}`)
    .eq(rowIdentifier.column, rowIdentifier.value)
    .maybeSingle()

  if (error) {
    throw new Error(`Leitura de seguranca falhou: ${error.message}`)
  }

  return data
}

async function updateProfileField(supabase, candidate, config) {
  const rowIdentifier = getRowIdentifier(candidate)
  const currentRow = await loadCurrentProfileField(supabase, candidate)

  if (!currentRow) {
    throw new Error(`Linha nao encontrada em ${candidate.source.table}.${rowIdentifier.column}.`)
  }

  const currentValue = currentRow[candidate.source.field]
  const currentProvider = classifyReference(currentValue, config)

  if (currentValue === candidate.r2PublicUrl || currentProvider === 'cloudflare-r2') {
    return {
      status: 'already-in-r2',
      updatedDatabase: false,
      alreadyInDatabase: true,
      currentProvider,
    }
  }

  if (currentValue !== candidate.originalUrl) {
    throw new Error(`Campo atual nao confere com a URL original esperada; provider atual: ${currentProvider}.`)
  }

  const { data: updatedData, error: updateError } = await supabase
    .from(candidate.source.table)
    .update({ [candidate.source.field]: candidate.r2PublicUrl })
    .eq(rowIdentifier.column, rowIdentifier.value)
    .eq(candidate.source.field, candidate.originalUrl)
    .select(`${rowIdentifier.column}, ${candidate.source.field}`)
    .maybeSingle()

  if (updateError) {
    throw new Error(`Update do banco falhou: ${updateError.message}`)
  }

  if (updatedData?.[candidate.source.field] === candidate.r2PublicUrl) {
    return {
      status: 'updated',
      updatedDatabase: true,
      alreadyInDatabase: false,
      currentProvider,
    }
  }

  const updatedRow = await loadCurrentProfileField(supabase, candidate)

  if (updatedRow?.[candidate.source.field] === candidate.r2PublicUrl) {
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
    throw new Error(`Update do banco nao retornou linha; provider atual apos tentativa: ${currentAfterProvider}.`)
  }

  throw new Error('Update do banco retornou linha, mas o campo nao foi confirmado com a URL R2.')
}

async function runMigrationOperations(supabase, config, candidates, warnings, options) {
  const client = getR2Client(config)
  const operations = []

  for (const candidate of candidates) {
    const rowIdentifier = getRowIdentifier(candidate)
    const operation = {
      table: candidate.source.table,
      field: candidate.source.field,
      profileId: rowIdentifier.value,
      rowIdentifier,
      originalUrlSanitized: sanitizeReference(candidate.originalUrl),
      sourceBucket: candidate.parsedStorage?.bucket || null,
      plannedR2Prefix: candidate.source.r2Prefix,
      plannedR2Reference: `r2://${candidate.source.r2Prefix}/[redacted]`,
      status: 'pending',
      uploadedToR2: false,
      r2ObjectAlreadyExisted: false,
      r2ObjectConfirmed: false,
      updatedDatabase: false,
      alreadyInDatabase: false,
      warning: null,
    }

    try {
      const existedBefore = await objectExistsInR2(client, config, candidate.r2Key)

      if (existedBefore) {
        operation.status = 'r2-object-already-existed'
        operation.r2ObjectAlreadyExisted = true
        operation.r2ObjectConfirmed = true
      } else if (!options.allowUpload) {
        throw new Error('Objeto R2 esperado ainda nao existe; repair-db nao faz upload.')
      } else {
        const file = await downloadSupabaseObject(supabase, candidate)
        await uploadToR2(client, config, candidate, file)
        operation.uploadedToR2 = true
        operation.r2ObjectConfirmed = await objectExistsInR2(client, config, candidate.r2Key)

        if (!operation.r2ObjectConfirmed) {
          throw new Error('Upload enviado, mas o objeto nao foi confirmado no R2.')
        }
      }

      const updateResult = await updateProfileField(supabase, candidate, config)
      operation.updatedDatabase = updateResult.updatedDatabase
      operation.alreadyInDatabase = updateResult.alreadyInDatabase

      if (updateResult.status === 'already-in-r2') {
        operation.status = 'already-in-r2'
      } else {
        operation.status = operation.status === 'r2-object-already-existed'
          ? 'updated-existing-r2-object'
          : 'uploaded-and-updated'
      }
    } catch (error) {
      operation.status = 'failed'
      operation.warning = sanitizeErrorMessage(error instanceof Error ? error.message : 'Erro inesperado.')
      warnings.push({
        table: candidate.source.table,
        field: candidate.source.field,
        profileId: rowIdentifier.value,
        rowIdentifier,
        message: operation.warning,
      })
    }

    operations.push(operation)
  }

  return operations
}

function makeBaseReport(mode, config, warnings) {
  const dryRun = mode === 'dry-run'
  const executeMode = mode === 'execute'
  return {
    generatedAt: new Date().toISOString(),
    mode,
    dryRun,
    safety: {
      updatesDatabase: !dryRun,
      uploadsFiles: executeMode,
      deletesFiles: false,
      printsSecrets: false,
    },
    config: getSafeConfig(config),
    before: null,
    after: null,
    candidates: [],
    operations: [],
    operationTotals: {
      attempted: 0,
      uploadedToR2: 0,
      r2ObjectAlreadyExisted: 0,
      r2ObjectConfirmed: 0,
      updatedDatabase: 0,
      alreadyInDatabase: 0,
      failed: 0,
    },
    warnings,
  }
}

function summarizeOperations(operations) {
  return operations.reduce(
    (acc, operation) => {
      acc.attempted += 1
      if (operation.uploadedToR2) acc.uploadedToR2 += 1
      if (operation.r2ObjectAlreadyExisted) acc.r2ObjectAlreadyExisted += 1
      if (operation.r2ObjectConfirmed) acc.r2ObjectConfirmed += 1
      if (operation.updatedDatabase) acc.updatedDatabase += 1
      if (operation.alreadyInDatabase) acc.alreadyInDatabase += 1
      if (operation.status === 'failed') acc.failed += 1
      return acc
    },
    {
      attempted: 0,
      uploadedToR2: 0,
      r2ObjectAlreadyExisted: 0,
      r2ObjectConfirmed: 0,
      updatedDatabase: 0,
      alreadyInDatabase: 0,
      failed: 0,
    },
  )
}

function writeReport(report, mode) {
  const reportPath =
    mode === 'execute'
      ? EXECUTE_REPORT_PATH
      : mode === 'repair-db'
        ? REPAIR_DB_REPORT_PATH
        : DRY_RUN_REPORT_PATH
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return reportPath
}

function printSummary(report, reportPath) {
  const totals = report.before?.totals?.byClassification || makeEmptyTotals()

  console.log(`Profile media migration ${report.mode}`)
  console.log(`Total analisado: ${report.before?.totals?.scanned || 0}`)
  console.log(`Candidatos Supabase Storage: ${report.candidates.length}`)
  console.log(`Ja em R2: ${totals['cloudflare-r2'] || 0}`)
  console.log(`Externos: ${totals['external-url'] || 0}`)
  console.log(`Local public: ${totals['local-public'] || 0}`)
  if (report.mode === 'execute' || report.mode === 'repair-db') {
    console.log(`Objetos R2 ja existentes: ${report.operationTotals.r2ObjectAlreadyExisted}`)
    console.log(`Uploads R2 confirmados: ${report.operationTotals.r2ObjectConfirmed}`)
    console.log(`Updates no banco: ${report.operationTotals.updatedDatabase}`)
    console.log(`Campos ja em R2: ${report.operationTotals.alreadyInDatabase}`)
    console.log(`Falhas: ${report.operationTotals.failed}`)
  }
  console.log(`Warnings: ${report.warnings.length}`)
  console.log(`Relatorio: ${reportPath}`)
}

async function main() {
  const mode = getMode()
  const config = getRuntimeConfig()
  const warnings = []
  const report = makeBaseReport(mode, config, warnings)

  if (!config.supabaseUrl) {
    warnings.push({ message: 'NEXT_PUBLIC_SUPABASE_URL ausente. Configure o ambiente local antes de rodar a migracao.' })
  }

  if (!config.serviceRoleKey) {
    warnings.push({ message: 'SUPABASE_SERVICE_ROLE_KEY ausente. A migracao precisa dela para leitura/update controlado, mas o valor nunca sera impresso.' })
  }

  if ((mode === 'execute' || mode === 'repair-db') && !hasR2WriteConfig(config)) {
    warnings.push({ message: 'Configuracao R2 incompleta. Operacao bloqueada antes de qualquer download, upload ou update.' })
  }

  if (!config.supabaseUrl || !config.serviceRoleKey || ((mode === 'execute' || mode === 'repair-db') && !hasR2WriteConfig(config))) {
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

  const before = await auditProfileMedia(supabase, config, warnings)
  report.before = {
    sources: before.sources,
    totals: before.totals,
  }
  report.candidates = before.candidates.map(getCandidateReportItem)

  if (mode === 'execute' || mode === 'repair-db') {
    report.operations = await runMigrationOperations(
      supabase,
      config,
      before.candidates,
      warnings,
      { allowUpload: mode === 'execute' },
    )
    report.operationTotals = summarizeOperations(report.operations)

    const after = await auditProfileMedia(supabase, config, warnings)
    report.after = {
      sources: after.sources,
      totals: after.totals,
      candidatesRemaining: after.candidates.map(getCandidateReportItem),
    }
  }

  const reportPath = writeReport(report, mode)
  printSummary(report, reportPath)
}

main().catch((error) => {
  const safeMessage = error instanceof Error ? sanitizeErrorMessage(error.message) : 'Erro inesperado.'
  console.error(`Falha na migracao de profile media: ${safeMessage}`)
  process.exitCode = 1
})

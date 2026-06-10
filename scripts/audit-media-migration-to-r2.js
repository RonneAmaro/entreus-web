#!/usr/bin/env node

/**
 * Dry-run audit for public media migration candidates.
 *
 * This script only reads database rows and writes a local JSON report.
 * It never updates Supabase, never uploads to R2, and never deletes objects.
 */

const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

const DEFAULT_PAGE_SIZE = 500
const DEFAULT_MAX_ROWS_PER_SOURCE = 5000
const REPORT_PATH = path.join(process.cwd(), 'reports', 'media-migration-dry-run.json')

const SOURCES = [
  { table: 'posts', idField: 'id', field: 'image_url', risk: 'high-public-image' },
  { table: 'posts', idField: 'id', field: 'video_url', risk: 'very-high-public-video' },
  { table: 'post_media', idField: 'id', field: 'media_url', risk: 'high-public-post-media' },
  { table: 'comment_media', idField: 'id', field: 'media_url', risk: 'medium-public-comment-media' },
]

const PROVIDERS = ['supabase-storage', 'cloudflare-r2', 'external-url', 'empty/null', 'unknown']

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

function sanitizeUrl(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

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

function classifyUrl(value, config) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 'empty/null'
  }

  const raw = String(value).trim()
  const lower = raw.toLowerCase()

  if (
    lower.includes('supabase.co/storage') ||
    lower.includes('/storage/v1/object/public/') ||
    (config.supabaseHost && lower.includes(config.supabaseHost) && lower.includes('/storage/'))
  ) {
    return 'supabase-storage'
  }

  if (
    lower.includes('r2.dev') ||
    (config.r2PublicHost && lower.includes(config.r2PublicHost))
  ) {
    return 'cloudflare-r2'
  }

  try {
    const parsed = new URL(raw)
    return ['http:', 'https:'].includes(parsed.protocol) ? 'external-url' : 'unknown'
  } catch {
    return 'unknown'
  }
}

function getFileNameFromPath(pathname) {
  const cleanPath = pathname.split('/').filter(Boolean)
  const lastSegment = cleanPath[cleanPath.length - 1] || 'media'
  return lastSegment
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'media'
}

function inferSuggestedR2Key(record, source) {
  const value = record[source.field]
  if (typeof value !== 'string' || !value.trim()) return null

  let fileName = 'media'
  try {
    const parsed = new URL(value)
    fileName = getFileNameFromPath(decodeURIComponent(parsed.pathname))
  } catch {
    fileName = getFileNameFromPath(value.replace(/[?#].*$/, ''))
  }

  const tableSegment = source.table.replace(/[^a-zA-Z0-9_-]+/g, '-')
  const fieldSegment = source.field.replace(/[^a-zA-Z0-9_-]+/g, '-')
  const idSegment = String(record[source.idField] || 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '-')

  return `migrated/${tableSegment}/${idSegment}/${fieldSegment}/${fileName}`
}

function makeEmptyTotals() {
  return PROVIDERS.reduce((acc, provider) => {
    acc[provider] = 0
    return acc
  }, {})
}

function addExample(summary, provider, value) {
  if (!value || summary.examples[provider].length >= 5) return
  summary.examples[provider].push(value)
}

async function auditSource(supabase, source, config, warnings) {
  const summary = {
    table: source.table,
    field: source.field,
    scanned: 0,
    truncated: false,
    totals: makeEmptyTotals(),
    examples: PROVIDERS.reduce((acc, provider) => {
      acc[provider] = []
      return acc
    }, {}),
  }
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
        message: `Fonte ignorada: ${error.message}`,
      })
      return { summary, candidates }
    }

    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) break

    for (const row of rows) {
      const provider = classifyUrl(row[source.field], config)
      const sanitized = sanitizeUrl(row[source.field])

      summary.scanned += 1
      summary.totals[provider] += 1
      addExample(summary, provider, sanitized)

      if (provider === 'supabase-storage') {
        candidates.push({
          table: source.table,
          id: row[source.idField],
          field: source.field,
          provider,
          originalUrlSanitized: sanitized,
          suggestedR2Key: inferSuggestedR2Key(row, source),
          risk: source.risk,
        })
      }
    }

    if (rows.length < config.pageSize) break

    if (to >= config.maxRowsPerSource - 1) {
      summary.truncated = true
      warnings.push({
        table: source.table,
        field: source.field,
        message: `Leitura limitada a ${config.maxRowsPerSource} linhas. Ajuste MEDIA_MIGRATION_AUDIT_MAX_ROWS_PER_SOURCE para ampliar.`,
      })
    }
  }

  return { summary, candidates }
}

function sumProvider(report, provider) {
  return report.sources.reduce((total, source) => total + (source.totals[provider] || 0), 0)
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

async function main() {
  const config = getRuntimeConfig()
  const warnings = []

  if (!config.supabaseUrl) {
    warnings.push({ message: 'NEXT_PUBLIC_SUPABASE_URL ausente. Configure o ambiente local antes de rodar a auditoria.' })
  }

  if (!config.serviceRoleKey) {
    warnings.push({ message: 'SUPABASE_SERVICE_ROLE_KEY ausente. A auditoria precisa dela para leitura local completa, mas o valor nunca sera impresso.' })
  }

  const report = {
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
      hasSupabaseUrl: Boolean(config.supabaseUrl),
      hasServiceRoleKey: Boolean(config.serviceRoleKey),
      hasR2PublicBaseUrl: Boolean(config.r2PublicHost),
    },
    sources: [],
    candidates: [],
    warnings,
  }

  if (!config.supabaseUrl || !config.serviceRoleKey) {
    writeReport(report)
    console.log('Dry-run de migracao de midias publicas para R2')
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

  writeReport(report)

  const totalAnalyzed = report.sources.reduce((total, source) => total + source.scanned, 0)
  const supabaseCandidates = report.candidates.length
  const alreadyR2 = sumProvider(report, 'cloudflare-r2')
  const external = sumProvider(report, 'external-url')

  console.log('Dry-run de migracao de midias publicas para R2')
  console.log(`Total analisado: ${totalAnalyzed}`)
  console.log(`Candidatos Supabase Storage: ${supabaseCandidates}`)
  console.log(`Ja em R2: ${alreadyR2}`)
  console.log(`Externos: ${external}`)
  console.log(`Warnings: ${warnings.length}`)
  console.log(`Relatorio: ${REPORT_PATH}`)
}

main().catch((error) => {
  const safeMessage = error instanceof Error ? error.message : 'Erro inesperado.'
  console.error(`Falha no dry-run: ${safeMessage}`)
  process.exitCode = 1
})

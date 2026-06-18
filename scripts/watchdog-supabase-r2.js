#!/usr/bin/env node

/**
 * EntreUS Supabase/R2 Watchdog.
 *
 * Safe local monitor: checks Supabase health, R2 env presence, runs the
 * extended media audit, and writes local JSON/Markdown reports.
 * It never updates the database, uploads files, deletes objects, or prints
 * secrets.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const JSON_REPORT_PATH = path.join(process.cwd(), 'reports', 'supabase-r2-watchdog.json')
const MARKDOWN_REPORT_PATH = path.join(process.cwd(), 'reports', 'supabase-r2-watchdog.md')
const EXTENDED_AUDIT_REPORT_PATH = path.join(process.cwd(), 'reports', 'media-migration-extended-dry-run.json')
const REQUIRED_R2_ENV_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
]
const PUBLIC_AREAS = ['public-profiles', 'public-posts', 'public-comments']
const SUPABASE_HEALTH_TIMEOUT_MS = 15000
const EXTENDED_AUDIT_TIMEOUT_MS = 90000

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

function sanitizeMessage(message) {
  return String(message || 'Erro inesperado.')
    .replace(/https?:\/\/[^\s)]+/gi, '[url-redacted]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/\b(token|key|secret|signature|apikey|access_token)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 600)
}

function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  }
}

function getR2ConfigPresence() {
  const variables = REQUIRED_R2_ENV_KEYS.reduce((acc, key) => {
    acc[key] = Boolean(process.env[key])
    return acc
  }, {})

  return {
    variables,
    complete: Object.values(variables).every(Boolean),
    missing: Object.entries(variables)
      .filter(([, present]) => !present)
      .map(([key]) => key),
  }
}

async function checkSupabaseHealth() {
  const { url, serviceRoleKey } = getSupabaseConfig()

  if (!url || !serviceRoleKey) {
    return {
      status: 'error',
      httpStatus: null,
      message: !url
        ? 'NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL ausente.'
        : 'SUPABASE_SERVICE_ROLE_KEY ausente.',
    }
  }

  let timeout = null

  try {
    const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/profiles?select=id&limit=1`
    const controller = new AbortController()
    timeout = setTimeout(() => controller.abort(), SUPABASE_HEALTH_TIMEOUT_MS)
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: 'application/json',
      },
    })
    clearTimeout(timeout)
    timeout = null

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        status: 'error',
        httpStatus: response.status,
        message: sanitizeMessage(text || response.statusText),
      }
    }

    return {
      status: 'ok',
      httpStatus: response.status,
      message: 'Supabase respondeu a consulta leve em profiles.',
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return {
      status: 'error',
      httpStatus: null,
      message: timedOut
        ? `Timeout de ${SUPABASE_HEALTH_TIMEOUT_MS}ms ao consultar Supabase.`
        : sanitizeMessage(error instanceof Error ? error.message : 'Falha ao consultar Supabase.'),
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function runExtendedAudit() {
  const command = getNpmCommand()
  const args = ['run', 'media:migration:extended-dry-run']
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: process.env,
    windowsHide: true,
    timeout: EXTENDED_AUDIT_TIMEOUT_MS,
  })

  return {
    command: `${command} ${args.join(' ')}`,
    exitCode: typeof result.status === 'number' ? result.status : null,
    signal: result.signal || null,
    error: result.error ? sanitizeMessage(result.error.message) : null,
    stdoutSummary: summarizeOutput(result.stdout),
    stderrSummary: summarizeOutput(result.stderr),
  }
}

function summarizeOutput(value) {
  if (!value) return ''
  return String(value)
    .split(/\r?\n/)
    .map((line) => sanitizeMessage(line.trim()))
    .filter(Boolean)
    .slice(-12)
    .join('\n')
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    return {
      error: sanitizeMessage(error instanceof Error ? error.message : 'Nao foi possivel ler JSON.'),
    }
  }
}

function makeEmptyClassificationTotals() {
  return {
    'supabase-storage': 0,
    'cloudflare-r2': 0,
    'external-url': 0,
    'local-public': 0,
    'empty/null': 0,
    unknown: 0,
  }
}

function extractAuditSummary(auditReport) {
  if (!auditReport || auditReport.error) {
    return {
      readable: false,
      error: auditReport?.error || 'Relatorio da auditoria estendida ausente.',
      totals: {
        scanned: 0,
        byClassification: makeEmptyClassificationTotals(),
        byArea: {},
      },
      warningsCount: 0,
      warnings: [],
      publicAreas: {},
    }
  }

  const totals = auditReport.totals || {}
  const byClassification = {
    ...makeEmptyClassificationTotals(),
    ...(totals.byClassification || {}),
  }
  const byArea = totals.byArea || {}
  const publicAreas = PUBLIC_AREAS.reduce((acc, area) => {
    acc[area] = byArea[area] || {
      scanned: 0,
      byClassification: makeEmptyClassificationTotals(),
    }
    return acc
  }, {})
  const warnings = Array.isArray(auditReport.warnings)
    ? auditReport.warnings.map((warning) => ({
        table: warning.table || null,
        field: warning.field || null,
        area: warning.area || null,
        privacy: warning.privacy || null,
        message: sanitizeMessage(warning.message || warning.error || 'Warning sem mensagem.'),
      }))
    : []

  return {
    readable: true,
    generatedAt: auditReport.generatedAt || null,
    totals: {
      scanned: totals.scanned || 0,
      byClassification,
      byArea,
    },
    warningsCount: warnings.length,
    warnings,
    publicAreas,
  }
}

function classifySeverity({ supabaseHealth, r2Config, auditRun, auditSummary }) {
  const alerts = []
  const supabaseStorageCount = auditSummary.totals.byClassification['supabase-storage'] || 0

  if (supabaseHealth.status !== 'ok') {
    alerts.push({
      severity: 'critical',
      code: 'SUPABASE_HEALTH_ERROR',
      message: 'Supabase nao respondeu a consulta leve.',
      action: 'Verificar status do Supabase, quota e variaveis locais.',
    })
  }

  if (supabaseStorageCount > 0) {
    alerts.push({
      severity: 'critical',
      code: 'SUPABASE_STORAGE_REFERENCES_FOUND',
      message: `Foram encontradas ${supabaseStorageCount} referencias de Supabase Storage.`,
      action: 'Verificar auditoria e migrar arquivos publicos para R2.',
    })
  }

  if (!r2Config.complete) {
    alerts.push({
      severity: 'warning',
      code: 'R2_CONFIG_INCOMPLETE',
      message: `Configuracao R2 incompleta: ${r2Config.missing.join(', ') || 'variavel ausente'}.`,
      action: 'Conferir variaveis R2 no ambiente local/servidor.',
    })
  }

  if (auditRun && (auditRun.error || auditRun.signal || auditRun.exitCode !== 0)) {
    alerts.push({
      severity: 'warning',
      code: 'EXTENDED_AUDIT_RUN_FAILED',
      message: 'Watchdog nao conseguiu reexecutar a auditoria estendida.',
      action: 'Rodar npm.cmd run media:migration:extended-dry-run e revisar o erro sanitizado.',
    })
  }

  if (auditSummary.warningsCount > 0) {
    alerts.push({
      severity: 'warning',
      code: 'EXTENDED_AUDIT_WARNINGS',
      message: `Auditoria estendida retornou ${auditSummary.warningsCount} warning(s).`,
      action: 'Abrir reports/media-migration-extended-dry-run.json e revisar warnings.',
    })
  }

  if (!auditSummary.readable) {
    alerts.push({
      severity: 'warning',
      code: 'EXTENDED_AUDIT_REPORT_UNREADABLE',
      message: 'Nao foi possivel ler o relatorio da auditoria estendida.',
      action: 'Rodar npm.cmd run media:migration:extended-dry-run e repetir o watchdog.',
    })
  }

  const severity = alerts.some((alert) => alert.severity === 'critical')
    ? 'critical'
    : alerts.some((alert) => alert.severity === 'warning')
      ? 'warning'
      : 'ok'

  return { severity, alerts }
}

function getEmailAlertStatus(severity) {
  const configured = Boolean(process.env.RESEND_API_KEY && process.env.WATCHDOG_ALERT_EMAIL)

  return {
    configured,
    attempted: false,
    sent: false,
    reason: configured
      ? 'Envio de e-mail nao implementado neste pacote para evitar dependencia nova.'
      : 'RESEND_API_KEY e WATCHDOG_ALERT_EMAIL nao estao ambos configurados.',
    wouldSend: configured && severity !== 'ok',
  }
}

function buildMarkdownReport(report) {
  const totals = report.audit.totals.byClassification
  const lines = [
    '# EntreUS Supabase/R2 Watchdog',
    '',
    `Gerado em: ${report.generatedAt}`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    '## Resumo',
    '',
    `- Supabase health: ${report.supabaseHealth.status}`,
    `- HTTP status Supabase: ${report.supabaseHealth.httpStatus ?? 'n/a'}`,
    `- Total analisado: ${report.audit.totals.scanned}`,
    `- Supabase Storage candidates: ${totals['supabase-storage'] || 0}`,
    `- R2 references: ${totals['cloudflare-r2'] || 0}`,
    `- External URLs: ${totals['external-url'] || 0}`,
    `- Local public: ${totals['local-public'] || 0}`,
    `- Warnings: ${report.audit.warningsCount}`,
    `- R2 config completa: ${report.r2Config.complete ? 'sim' : 'nao'}`,
    '',
    '## Areas Publicas',
    '',
    '| Area | Scanned | Supabase Storage | R2 | External | Local public | Warnings |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ]

  for (const area of PUBLIC_AREAS) {
    const item = report.audit.publicAreas[area] || {}
    const areaTotals = item.byClassification || {}
    lines.push(
      `| ${area} | ${item.scanned || 0} | ${areaTotals['supabase-storage'] || 0} | ${areaTotals['cloudflare-r2'] || 0} | ${areaTotals['external-url'] || 0} | ${areaTotals['local-public'] || 0} | ${report.audit.warnings.filter((warning) => warning.area === area).length} |`,
    )
  }

  lines.push('', '## Alertas', '')

  if (report.alerts.length === 0) {
    lines.push('- Nenhum alerta ativo.')
  } else {
    for (const alert of report.alerts) {
      lines.push(`- **${alert.severity.toUpperCase()}** ${alert.code}: ${alert.message} Acao: ${alert.action}`)
    }
  }

  lines.push(
    '',
    '## Quota',
    '',
    `- Disponivel: ${report.usageQuota.available ? 'sim' : 'nao'}`,
    `- Motivo: ${report.usageQuota.reason}`,
    '',
    '## Garantias',
    '',
    '- Este watchdog nao altera banco.',
    '- Este watchdog nao faz upload.',
    '- Este watchdog nao apaga arquivos no Supabase Storage nem no R2.',
    '- Este watchdog nao imprime secrets.',
    '',
  )

  return `${lines.join('\n')}\n`
}

function writeReports(report) {
  fs.mkdirSync(path.dirname(JSON_REPORT_PATH), { recursive: true })
  fs.writeFileSync(JSON_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  fs.writeFileSync(MARKDOWN_REPORT_PATH, buildMarkdownReport(report), 'utf8')
}

function printConsoleSummary(report) {
  const totals = report.audit.totals.byClassification
  const action = report.alerts.find((alert) => alert.severity === 'critical')?.action

  console.log('EntreUS Supabase/R2 Watchdog')
  console.log(`Status: ${report.status.toUpperCase()}`)
  console.log(`Supabase health: ${report.supabaseHealth.status.toUpperCase()}`)
  console.log(`Supabase Storage candidates: ${totals['supabase-storage'] || 0}`)
  console.log(`R2 references: ${totals['cloudflare-r2'] || 0}`)
  console.log(`Warnings: ${report.audit.warningsCount}`)
  if (action) {
    console.log(`Action: ${action}`)
  }
  console.log(`Report: ${path.relative(process.cwd(), JSON_REPORT_PATH)}`)
}

async function main() {
  loadEnvFile(path.join(process.cwd(), '.env.local'))

  const supabaseHealth = await checkSupabaseHealth()
  const r2Config = getR2ConfigPresence()
  const auditRun = runExtendedAudit()
  const auditReport = readJsonFile(EXTENDED_AUDIT_REPORT_PATH)
  const auditSummary = extractAuditSummary(auditReport)
  const { severity, alerts } = classifySeverity({
    supabaseHealth,
    r2Config,
    auditRun,
    auditSummary,
  })
  const usageQuota = {
    available: false,
    reason: 'Uso real de quota Supabase ainda nao integrado neste pacote',
    thresholds: {
      planned: [50, 75, 90],
    },
  }

  const report = {
    generatedAt: new Date().toISOString(),
    status: severity,
    safety: {
      updatesDatabase: false,
      uploadsFiles: false,
      deletesFiles: false,
      printsSecrets: false,
    },
    supabaseHealth,
    r2Config,
    auditRun,
    audit: auditSummary,
    usageQuota,
    emailAlert: getEmailAlertStatus(severity),
    alerts,
    reports: {
      json: path.relative(process.cwd(), JSON_REPORT_PATH),
      markdown: path.relative(process.cwd(), MARKDOWN_REPORT_PATH),
      extendedAudit: path.relative(process.cwd(), EXTENDED_AUDIT_REPORT_PATH),
    },
  }

  writeReports(report)
  printConsoleSummary(report)

  if (severity === 'critical') {
    process.exitCode = 2
  } else if (severity === 'warning') {
    process.exitCode = 1
  }
}

main().catch((error) => {
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'critical',
    safety: {
      updatesDatabase: false,
      uploadsFiles: false,
      deletesFiles: false,
      printsSecrets: false,
    },
    supabaseHealth: {
      status: 'error',
      httpStatus: null,
      message: sanitizeMessage(error instanceof Error ? error.message : 'Falha inesperada no watchdog.'),
    },
    r2Config: getR2ConfigPresence(),
    auditRun: null,
    audit: extractAuditSummary({ error: 'Watchdog falhou antes de concluir auditoria.' }),
    usageQuota: {
      available: false,
      reason: 'Uso real de quota Supabase ainda nao integrado neste pacote',
      thresholds: {
        planned: [50, 75, 90],
      },
    },
    emailAlert: {
      configured: false,
      attempted: false,
      sent: false,
      reason: 'Watchdog falhou antes de avaliar envio.',
      wouldSend: false,
    },
    alerts: [
      {
        severity: 'critical',
        code: 'WATCHDOG_FAILED',
        message: 'Watchdog falhou antes de concluir.',
        action: 'Revisar erro sanitizado no relatorio JSON.',
      },
    ],
    reports: {
      json: path.relative(process.cwd(), JSON_REPORT_PATH),
      markdown: path.relative(process.cwd(), MARKDOWN_REPORT_PATH),
      extendedAudit: path.relative(process.cwd(), EXTENDED_AUDIT_REPORT_PATH),
    },
  }

  writeReports(report)
  printConsoleSummary(report)
  process.exitCode = 2
})

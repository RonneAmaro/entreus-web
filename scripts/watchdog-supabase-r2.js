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
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')

const JSON_REPORT_PATH = path.join(process.cwd(), 'reports', 'supabase-r2-watchdog.json')
const MARKDOWN_REPORT_PATH = path.join(process.cwd(), 'reports', 'supabase-r2-watchdog.md')
const EXTENDED_AUDIT_REPORT_PATH = path.join(process.cwd(), 'reports', 'media-migration-extended-dry-run.json')
const ALERT_STATE_PATH = path.join(process.cwd(), 'reports', 'supabase-r2-watchdog-alert-state.json')
const RESEND_EMAILS_API_URL = 'https://api.resend.com/emails'
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
const RESEND_TIMEOUT_MS = 15000
const DEFAULT_ALERT_COOLDOWN_HOURS = 12

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
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email-redacted]')
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

function isTestEmailMode() {
  return process.argv.includes('--test-email')
}

function getPositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value || ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getEmailAddress(value) {
  const raw = String(value || '').trim()
  const angleMatch = raw.match(/<([^<>\s@]+@[^<>\s@]+)>/)
  if (angleMatch) return angleMatch[1]

  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return emailMatch ? emailMatch[0] : ''
}

function maskEmail(value) {
  const email = getEmailAddress(value).toLowerCase()
  const [local, domain] = email.split('@')

  if (!local || !domain) return '[redacted-email]'

  const domainParts = domain.split('.')
  const domainName = domainParts.shift() || ''
  const tld = domainParts.join('.')
  const maskedLocal = local.length <= 2 ? `${local.slice(0, 1) || '*'}***` : `${local[0]}***${local.slice(-1)}`
  const maskedDomain = `${domainName.slice(0, 1) || '*'}***${tld ? `.${tld}` : ''}`

  return `${maskedLocal}@${maskedDomain}`
}

function getEmailAlertConfig() {
  const cooldownHours = getPositiveNumber(
    process.env.WATCHDOG_ALERT_COOLDOWN_HOURS,
    DEFAULT_ALERT_COOLDOWN_HOURS,
  )
  const resendApiKey = process.env.RESEND_API_KEY || ''
  const to = process.env.WATCHDOG_ALERT_EMAIL || ''
  const from =
    process.env.WATCHDOG_ALERT_FROM ||
    process.env.EMAIL_FROM ||
    'EntreUS Watchdog <onboarding@resend.dev>'

  return {
    configured: Boolean(resendApiKey && to),
    resendApiKey,
    to,
    from,
    cooldownHours,
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

function buildSummary({ supabaseHealth, r2Config, auditSummary }) {
  const totals = auditSummary.totals.byClassification

  return {
    totalAnalyzed: auditSummary.totals.scanned,
    supabaseStorageCandidates: totals['supabase-storage'] || 0,
    cloudflareR2: totals['cloudflare-r2'] || 0,
    externalUrls: totals['external-url'] || 0,
    localPublic: totals['local-public'] || 0,
    warnings: auditSummary.warningsCount,
    supabaseHealth: supabaseHealth.status,
    r2ConfigComplete: r2Config.complete,
  }
}

function createAlertFingerprint(report) {
  const payload = {
    status: report.status,
    supabaseStorageCandidates: report.summary.supabaseStorageCandidates,
    warnings: report.summary.warnings,
    supabaseHealthStatus: report.supabaseHealth.status,
    r2ConfigComplete: report.r2Config.complete,
  }

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function readAlertState() {
  if (!fs.existsSync(ALERT_STATE_PATH)) return null

  try {
    return JSON.parse(fs.readFileSync(ALERT_STATE_PATH, 'utf8'))
  } catch (error) {
    return {
      unreadable: true,
      error: sanitizeMessage(error instanceof Error ? error.message : 'Nao foi possivel ler estado de alerta.'),
    }
  }
}

function writeAlertState(state) {
  fs.mkdirSync(path.dirname(ALERT_STATE_PATH), { recursive: true })
  fs.writeFileSync(ALERT_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function getCooldownStatus(state, fingerprint, cooldownHours, nowMs) {
  if (!state || state.unreadable || state.fingerprint !== fingerprint || !state.sentAt) {
    return { active: false }
  }

  const sentAtMs = Date.parse(state.sentAt)
  if (!Number.isFinite(sentAtMs)) {
    return { active: false }
  }

  const cooldownMs = cooldownHours * 60 * 60 * 1000
  const elapsedMs = nowMs - sentAtMs

  if (elapsedMs >= cooldownMs) {
    return { active: false }
  }

  return {
    active: true,
    cooldownUntil: new Date(sentAtMs + cooldownMs).toISOString(),
  }
}

function getRecommendedAction(report, testEmail) {
  if (testEmail) return 'Teste manual solicitado; nenhuma acao operacional e necessaria se o status estiver ok.'

  const criticalAlert = report.alerts.find((alert) => alert.severity === 'critical')
  const firstAlert = criticalAlert || report.alerts[0]

  return firstAlert?.action || 'Nenhuma acao recomendada no momento.'
}

function buildEmailSubject(status, testEmail) {
  if (testEmail) return '[EntreUS Watchdog] Teste de alerta'
  if (status === 'critical') return '[EntreUS Watchdog] CRITICAL - ação necessária'
  return '[EntreUS Watchdog] WARNING - verificar Supabase/R2'
}

function buildEmailText(report, testEmail) {
  const summary = report.summary
  const action = getRecommendedAction(report, testEmail)

  return [
    'EntreUS Supabase/R2 Watchdog',
    '',
    `Status geral: ${report.status.toUpperCase()}${testEmail ? ' (teste)' : ''}`,
    `Gerado em: ${report.generatedAt}`,
    `Supabase health: ${report.supabaseHealth.status}`,
    `HTTP status Supabase: ${report.supabaseHealth.httpStatus ?? 'n/a'}`,
    `Supabase Storage candidates: ${summary.supabaseStorageCandidates}`,
    `Cloudflare R2 references: ${summary.cloudflareR2}`,
    `External URLs: ${summary.externalUrls}`,
    `Local public: ${summary.localPublic}`,
    `Warnings: ${summary.warnings}`,
    `R2 config completa: ${summary.r2ConfigComplete ? 'sim' : 'nao'}`,
    '',
    `Acao recomendada: ${action}`,
    '',
    'Relatorios locais:',
    `- ${report.reports.json}`,
    `- ${report.reports.markdown}`,
    '',
    'Este e-mail nao inclui secrets, signed URLs ou listas completas de URLs.',
  ].join('\n')
}

async function sendResendAlert({ resendApiKey, from, to, subject, text }) {
  let timeout = null

  try {
    const controller = new AbortController()
    timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS)
    const response = await fetch(RESEND_EMAILS_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
      }),
    })
    clearTimeout(timeout)
    timeout = null

    if (!response.ok) {
      const responseText = await response.text().catch(() => '')
      return {
        sent: false,
        statusCode: response.status,
        error: sanitizeMessage(responseText || response.statusText),
      }
    }

    return {
      sent: true,
      statusCode: response.status,
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'

    return {
      sent: false,
      statusCode: null,
      error: timedOut
        ? `Timeout de ${RESEND_TIMEOUT_MS}ms ao enviar alerta pela Resend.`
        : sanitizeMessage(error instanceof Error ? error.message : 'Falha ao enviar alerta pela Resend.'),
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

async function getEmailAlertStatus(report, { testEmail }) {
  const config = getEmailAlertConfig()
  const base = {
    configured: config.configured,
    attempted: false,
    sent: false,
    provider: 'resend',
    testEmail,
    cooldownHours: config.cooldownHours,
  }

  if (!config.configured) {
    return {
      configured: false,
      attempted: false,
      sent: false,
      reason: 'WATCHDOG_ALERT_EMAIL ou RESEND_API_KEY ausente',
      testEmail,
      cooldownHours: config.cooldownHours,
    }
  }

  const destination = maskEmail(config.to)
  const shouldSend = testEmail || report.status === 'warning' || report.status === 'critical'

  if (!shouldSend) {
    return {
      ...base,
      to: destination,
      reason: 'Status ok; alerta nao enviado',
    }
  }

  const fingerprint = createAlertFingerprint(report)

  if (!testEmail) {
    const state = readAlertState()
    const cooldown = getCooldownStatus(state, fingerprint, config.cooldownHours, Date.now())

    if (cooldown.active) {
      return {
        ...base,
        to: destination,
        fingerprint,
        cooldownUntil: cooldown.cooldownUntil,
        reason: `Mesmo alerta ja enviado dentro do cooldown de ${config.cooldownHours}h`,
      }
    }
  }

  const subject = buildEmailSubject(report.status, testEmail)
  const result = await sendResendAlert({
    resendApiKey: config.resendApiKey,
    from: config.from,
    to: config.to,
    subject,
    text: buildEmailText(report, testEmail),
  })

  if (result.sent && !testEmail) {
    writeAlertState({
      updatedAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      fingerprint,
      status: report.status,
      cooldownHours: config.cooldownHours,
      provider: 'resend',
      to: destination,
    })
  }

  return {
    ...base,
    attempted: true,
    sent: result.sent,
    to: destination,
    from: maskEmail(config.from),
    subject,
    fingerprint,
    statusCode: result.statusCode,
    reason: result.sent ? 'Alerta enviado pela Resend' : 'Falha ao enviar alerta pela Resend',
    ...(result.error ? { error: result.error } : {}),
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

  const emailAlert = report.emailAlert || {}

  lines.push(
    '',
    '## E-mail',
    '',
    `- Configurado: ${emailAlert.configured ? 'sim' : 'nao'}`,
    `- Tentou enviar: ${emailAlert.attempted ? 'sim' : 'nao'}`,
    `- Enviado: ${emailAlert.sent ? 'sim' : 'nao'}`,
    `- Teste: ${emailAlert.testEmail ? 'sim' : 'nao'}`,
    `- Destino: ${emailAlert.to || 'n/a'}`,
    `- Motivo: ${emailAlert.reason || 'n/a'}`,
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
  console.log(`Email alert: ${report.emailAlert.sent ? 'sent' : report.emailAlert.attempted ? 'attempted' : 'skipped'}`)
  if (action) {
    console.log(`Action: ${action}`)
  }
  console.log(`Report: ${path.relative(process.cwd(), JSON_REPORT_PATH)}`)
}

async function main() {
  const testEmail = isTestEmailMode()

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
  const summary = buildSummary({
    supabaseHealth,
    r2Config,
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
    summary,
    audit: auditSummary,
    usageQuota,
    emailAlert: {
      configured: false,
      attempted: false,
      sent: false,
      reason: 'Avaliacao de e-mail ainda nao concluida.',
    },
    alerts,
    reports: {
      json: path.relative(process.cwd(), JSON_REPORT_PATH),
      markdown: path.relative(process.cwd(), MARKDOWN_REPORT_PATH),
      extendedAudit: path.relative(process.cwd(), EXTENDED_AUDIT_REPORT_PATH),
      alertState: path.relative(process.cwd(), ALERT_STATE_PATH),
    },
  }

  try {
    report.emailAlert = await getEmailAlertStatus(report, { testEmail })
  } catch (emailError) {
    const config = getEmailAlertConfig()
    report.emailAlert = {
      configured: config.configured,
      attempted: false,
      sent: false,
      provider: 'resend',
      testEmail,
      cooldownHours: config.cooldownHours,
      reason: 'Falha ao avaliar envio de alerta.',
      error: sanitizeMessage(emailError instanceof Error ? emailError.message : 'Erro inesperado no alerta.'),
    }
  }

  writeReports(report)
  printConsoleSummary(report)

  if (severity === 'critical') {
    process.exitCode = 2
  } else if (severity === 'warning') {
    process.exitCode = 1
  }
}

main().catch(async (error) => {
  const testEmail = isTestEmailMode()

  loadEnvFile(path.join(process.cwd(), '.env.local'))

  const supabaseHealth = {
    status: 'error',
    httpStatus: null,
    message: sanitizeMessage(error instanceof Error ? error.message : 'Falha inesperada no watchdog.'),
  }
  const r2Config = getR2ConfigPresence()
  const auditSummary = extractAuditSummary({ error: 'Watchdog falhou antes de concluir auditoria.' })

  const report = {
    generatedAt: new Date().toISOString(),
    status: 'critical',
    safety: {
      updatesDatabase: false,
      uploadsFiles: false,
      deletesFiles: false,
      printsSecrets: false,
    },
    supabaseHealth,
    r2Config,
    auditRun: null,
    summary: buildSummary({
      supabaseHealth,
      r2Config,
      auditSummary,
    }),
    audit: auditSummary,
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
      reason: 'Avaliacao de e-mail ainda nao concluida.',
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
      alertState: path.relative(process.cwd(), ALERT_STATE_PATH),
    },
  }

  try {
    report.emailAlert = await getEmailAlertStatus(report, { testEmail })
  } catch (emailError) {
    const config = getEmailAlertConfig()
    report.emailAlert = {
      configured: config.configured,
      attempted: false,
      sent: false,
      provider: 'resend',
      testEmail,
      cooldownHours: config.cooldownHours,
      reason: 'Falha ao avaliar envio de alerta.',
      error: sanitizeMessage(emailError instanceof Error ? emailError.message : 'Erro inesperado no alerta.'),
    }
  }

  writeReports(report)
  printConsoleSummary(report)
  process.exitCode = 2
})

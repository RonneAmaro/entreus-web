#!/usr/bin/env node

/**
 * Safe .env.local maintenance for EntreUS.
 *
 * Reads local env files without printing values, audits duplicate variables,
 * and can normalize .env.local by keeping the last occurrence of each key.
 */

const fs = require('node:fs')
const path = require('node:path')

const ENV_PATH = path.join(process.cwd(), '.env.local')
const REPORTS_DIR = path.join(process.cwd(), 'reports')
const AUDIT_JSON_PATH = path.join(REPORTS_DIR, 'env-local-audit.json')
const AUDIT_MD_PATH = path.join(REPORTS_DIR, 'env-local-audit.md')
const DRY_RUN_JSON_PATH = path.join(REPORTS_DIR, 'env-local-normalize-dry-run.json')
const DRY_RUN_MD_PATH = path.join(REPORTS_DIR, 'env-local-normalize-dry-run.md')
const WRITE_JSON_PATH = path.join(REPORTS_DIR, 'env-local-normalize-write.json')
const WRITE_MD_PATH = path.join(REPORTS_DIR, 'env-local-normalize-write.md')

const VARIABLES_TO_CHECK = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
  'RESEND_API_KEY',
  'WATCHDOG_ALERT_EMAIL',
  'WATCHDOG_ALERT_FROM',
  'WATCHDOG_ALERT_COOLDOWN_HOURS',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'MERCADO_PAGO_ACCESS_TOKEN',
]

function parseArgs() {
  const wantsAudit = process.argv.includes('--audit')
  const wantsNormalize = process.argv.includes('--normalize')
  const wantsDryRun = process.argv.includes('--dry-run')
  const wantsWrite = process.argv.includes('--write')

  if (wantsAudit && (wantsNormalize || wantsDryRun || wantsWrite)) {
    throw new Error('Use --audit sozinho, ou --normalize com --dry-run/--write.')
  }

  if (wantsNormalize && wantsDryRun && wantsWrite) {
    throw new Error('Use apenas --dry-run ou --write.')
  }

  if (wantsAudit) return { mode: 'audit', dryRun: false, write: false }
  if (wantsNormalize && wantsDryRun) return { mode: 'normalize', dryRun: true, write: false }
  if (wantsNormalize && wantsWrite) return { mode: 'normalize', dryRun: false, write: true }

  throw new Error('Modo invalido. Use --audit, --normalize --dry-run ou --normalize --write.')
}

function sanitizeMessage(message) {
  return String(message || 'Erro inesperado.')
    .replace(/https?:\/\/[^\s)]+/gi, '[url-redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email-redacted]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/\b(token|key|secret|signature|apikey|access_token)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 600)
}

function getRelative(filePath) {
  return path.relative(process.cwd(), filePath)
}

function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    return {
      exists: false,
      content: '',
      newline: '\n',
      lines: [],
      hadFinalNewline: false,
    }
  }

  const content = fs.readFileSync(ENV_PATH, 'utf8')
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const hadFinalNewline = normalized.endsWith('\n')
  const lines = content.length === 0 ? [] : normalized.split('\n')

  if (hadFinalNewline) {
    lines.pop()
  }

  return {
    exists: true,
    content,
    newline,
    lines,
    hadFinalNewline,
  }
}

function serializeLines(lines, newline, hadFinalNewline) {
  if (lines.length === 0) return ''
  return `${lines.join(newline)}${hadFinalNewline ? newline : ''}`
}

function parseAssignment(line, index) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
  if (!match) return null

  return {
    name: match[1],
    index,
    line: index + 1,
  }
}

function analyzeLines(lines) {
  const assignments = []
  const occurrencesByName = new Map()

  lines.forEach((line, index) => {
    const assignment = parseAssignment(line, index)
    if (!assignment) return

    assignments.push(assignment)

    const occurrences = occurrencesByName.get(assignment.name) || []
    occurrences.push(assignment)
    occurrencesByName.set(assignment.name, occurrences)
  })

  const duplicates = [...occurrencesByName.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([name, occurrences]) => {
      const linesForName = occurrences.map((item) => item.line)
      const lastLine = linesForName[linesForName.length - 1]

      return {
        name,
        occurrences: occurrences.length,
        lines: linesForName,
        lastLine,
        duplicateLinesBeforeLast: linesForName.slice(0, -1),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const required = VARIABLES_TO_CHECK.reduce((acc, variableName) => {
    acc[variableName] = occurrencesByName.has(variableName)
    return acc
  }, {})

  return {
    totalLines: lines.length,
    totalVariables: assignments.length,
    uniqueVariables: occurrencesByName.size,
    assignments,
    occurrencesByName,
    duplicates,
    required,
  }
}

function getNormalizationPlan(lines, analysis) {
  const lastIndexByName = new Map()

  for (const assignment of analysis.assignments) {
    lastIndexByName.set(assignment.name, assignment.index)
  }

  const removals = analysis.assignments
    .filter((assignment) => lastIndexByName.get(assignment.name) !== assignment.index)
    .map((assignment) => ({
      name: assignment.name,
      line: assignment.line,
      keptLine: (analysis.occurrencesByName.get(assignment.name) || []).at(-1)?.line || null,
    }))

  const removalIndexes = new Set(removals.map((removal) => removal.line - 1))
  const normalizedLines = lines.filter((_, index) => !removalIndexes.has(index))

  return {
    removals,
    normalizedLines,
    variablesDeduplicated: [...new Set(removals.map((removal) => removal.name))].sort(),
  }
}

function makeSafetyBlock() {
  return {
    printsSecrets: false,
    updatesDatabase: false,
    uploadsFiles: false,
    deletesFiles: false,
    createsSqlMigration: false,
  }
}

function makeTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function makeBackupPath() {
  const basePath = path.join(process.cwd(), `.env.local.bak-env-cleanup-${makeTimestamp()}`)

  if (!fs.existsSync(basePath)) return basePath

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${basePath}-${index}`
    if (!fs.existsSync(candidate)) return candidate
  }

  throw new Error('Nao foi possivel criar caminho unico de backup.')
}

function buildAuditReport(envFile, analysis) {
  const warnings = []

  if (!envFile.exists) {
    warnings.push({
      code: 'ENV_LOCAL_NOT_FOUND',
      message: '.env.local nao encontrado.',
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'audit',
    dryRun: true,
    envFile: getRelative(ENV_PATH),
    safety: makeSafetyBlock(),
    totalLines: analysis.totalLines,
    totalVariables: analysis.totalVariables,
    uniqueVariables: analysis.uniqueVariables,
    duplicates: analysis.duplicates,
    duplicateVariablesCount: analysis.duplicates.length,
    required: analysis.required,
    warnings,
  }
}

function buildNormalizeReport({
  envFile,
  analysis,
  plan,
  normalizedAnalysis,
  dryRun,
  backupPath,
  backupCreated,
  wroteFile,
}) {
  const reportPath = dryRun ? DRY_RUN_JSON_PATH : WRITE_JSON_PATH
  const markdownPath = dryRun ? DRY_RUN_MD_PATH : WRITE_MD_PATH
  const warnings = []

  if (!envFile.exists) {
    warnings.push({
      code: 'ENV_LOCAL_NOT_FOUND',
      message: '.env.local nao encontrado.',
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'normalize',
    dryRun,
    status: warnings.length > 0 ? 'warning' : 'ok',
    envFile: getRelative(ENV_PATH),
    safety: makeSafetyBlock(),
    rule: 'keep-last-occurrence',
    backup: {
      created: backupCreated,
      path: backupPath ? getRelative(backupPath) : null,
      wouldCreate: dryRun && Boolean(backupPath),
    },
    duplicates: analysis.duplicates,
    duplicateVariablesCount: analysis.duplicates.length,
    variablesDeduplicated: plan.variablesDeduplicated,
    plannedRemovals: {
      count: plan.removals.length,
      items: plan.removals,
    },
    removals: {
      count: plan.removals.length,
      items: plan.removals,
    },
    removedDuplicates: dryRun
      ? null
      : {
          count: plan.removals.length,
          items: plan.removals,
        },
    wroteFile,
    finalTotalLines: normalizedAnalysis.totalLines,
    finalTotalVariables: normalizedAnalysis.totalVariables,
    finalUniqueVariables: normalizedAnalysis.uniqueVariables,
    finalDuplicates: normalizedAnalysis.duplicates,
    duplicatesAfter: normalizedAnalysis.duplicates,
    required: normalizedAnalysis.required,
    warnings,
    reports: {
      json: getRelative(reportPath),
      markdown: getRelative(markdownPath),
    },
  }
}

function escapeMarkdown(value) {
  return String(value).replace(/\|/g, '\\|')
}

function buildAuditMarkdown(report) {
  const lines = [
    '# .env.local Audit',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Env file: ${report.envFile}`,
    `- Total lines: ${report.totalLines}`,
    `- Total variable assignments: ${report.totalVariables}`,
    `- Unique variables: ${report.uniqueVariables}`,
    `- Duplicate variables: ${report.duplicateVariablesCount}`,
    '',
    '## Duplicates',
    '',
  ]

  if (report.duplicates.length === 0) {
    lines.push('- No duplicate variables found.')
  } else {
    lines.push('| Variable | Occurrences | Lines | Last line |')
    lines.push('|---|---:|---|---:|')
    for (const duplicate of report.duplicates) {
      lines.push(
        `| ${escapeMarkdown(duplicate.name)} | ${duplicate.occurrences} | ${duplicate.lines.join(', ')} | ${duplicate.lastLine} |`,
      )
    }
  }

  lines.push('', '## Variable Presence', '', '| Variable | Present |', '|---|---:|')

  for (const variableName of VARIABLES_TO_CHECK) {
    lines.push(`| ${escapeMarkdown(variableName)} | ${report.required[variableName] ? 'true' : 'false'} |`)
  }

  lines.push(
    '',
    '## Safety',
    '',
    '- Values are not printed.',
    '- Secrets are not written to reports.',
    '- No database, upload, delete, or SQL migration action is performed.',
    '',
  )

  return `${lines.join('\n')}\n`
}

function buildNormalizeMarkdown(report) {
  const lines = [
    `# .env.local Normalize ${report.dryRun ? 'Dry Run' : 'Write'}`,
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Env file: ${report.envFile}`,
    `- Dry run: ${report.dryRun ? 'true' : 'false'}`,
    `- Rule: ${report.rule}`,
    `- Duplicate variables before: ${report.duplicateVariablesCount}`,
    `- Planned removals: ${report.plannedRemovals.count}`,
    `- Wrote file: ${report.wroteFile ? 'true' : 'false'}`,
    `- Backup created: ${report.backup.created ? 'true' : 'false'}`,
    `- Backup path: ${report.backup.path || 'n/a'}`,
    `- Final duplicate variables: ${report.finalDuplicates.length}`,
    '',
    '## Deduplicated Variables',
    '',
  ]

  if (report.variablesDeduplicated.length === 0) {
    lines.push('- No variables need deduplication.')
  } else {
    lines.push('| Variable | Removed lines | Kept line |')
    lines.push('|---|---|---:|')

    for (const variableName of report.variablesDeduplicated) {
      const removals = report.plannedRemovals.items.filter((item) => item.name === variableName)
      const removedLines = removals.map((item) => item.line).join(', ')
      const keptLine = removals[0]?.keptLine || 'n/a'
      lines.push(`| ${escapeMarkdown(variableName)} | ${removedLines} | ${keptLine} |`)
    }
  }

  lines.push(
    '',
    '## Safety',
    '',
    '- Values are not printed.',
    '- Secrets are not written to reports.',
    '- No database, upload, delete, or SQL migration action is performed.',
    '- Write mode creates a backup before changing .env.local.',
    '',
  )

  return `${lines.join('\n')}\n`
}

function writeReport(jsonPath, markdownPath, report, markdown) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  fs.writeFileSync(markdownPath, markdown, 'utf8')
}

function printAuditSummary(report) {
  console.log('.env.local audit')
  console.log(`Total lines: ${report.totalLines}`)
  console.log(`Variable assignments: ${report.totalVariables}`)
  console.log(`Unique variables: ${report.uniqueVariables}`)
  console.log(`Duplicate variables: ${report.duplicateVariablesCount}`)

  for (const duplicate of report.duplicates) {
    console.log(`- ${duplicate.name}: ${duplicate.occurrences} occurrence(s), last line ${duplicate.lastLine}`)
  }

  console.log(`Report: ${getRelative(AUDIT_JSON_PATH)}`)
}

function printNormalizeSummary(report) {
  console.log('.env.local normalize')
  console.log(`Dry run: ${report.dryRun}`)
  console.log(`Duplicate variables: ${report.duplicateVariablesCount}`)
  console.log(`Lines to remove: ${report.plannedRemovals.count}`)

  for (const variableName of report.variablesDeduplicated) {
    const removals = report.plannedRemovals.items.filter((item) => item.name === variableName)
    console.log(`- ${variableName}: remove ${removals.length} earlier occurrence(s)`)
  }

  if (report.backup.path) {
    console.log(`${report.dryRun ? 'Backup would be' : 'Backup'}: ${report.backup.path}`)
  }

  console.log(`Report: ${report.reports.json}`)
}

function runAudit() {
  const envFile = readEnvFile()
  const analysis = analyzeLines(envFile.lines)
  const report = buildAuditReport(envFile, analysis)

  writeReport(AUDIT_JSON_PATH, AUDIT_MD_PATH, report, buildAuditMarkdown(report))
  printAuditSummary(report)
}

function runNormalize({ dryRun }) {
  const envFile = readEnvFile()
  const analysis = analyzeLines(envFile.lines)
  const plan = getNormalizationPlan(envFile.lines, analysis)
  const backupPath = plan.removals.length > 0 ? makeBackupPath() : null
  const normalizedContent = serializeLines(plan.normalizedLines, envFile.newline, envFile.hadFinalNewline)
  const normalizedAnalysis = analyzeLines(plan.normalizedLines)
  let backupCreated = false
  let wroteFile = false

  if (!dryRun && envFile.exists && plan.removals.length > 0) {
    fs.copyFileSync(ENV_PATH, backupPath)
    backupCreated = true
    fs.writeFileSync(ENV_PATH, normalizedContent, 'utf8')
    wroteFile = true
  }

  const report = buildNormalizeReport({
    envFile,
    analysis,
    plan,
    normalizedAnalysis,
    dryRun,
    backupPath,
    backupCreated,
    wroteFile,
  })
  const jsonPath = dryRun ? DRY_RUN_JSON_PATH : WRITE_JSON_PATH
  const markdownPath = dryRun ? DRY_RUN_MD_PATH : WRITE_MD_PATH

  writeReport(jsonPath, markdownPath, report, buildNormalizeMarkdown(report))
  printNormalizeSummary(report)
}

function main() {
  const args = parseArgs()

  if (args.mode === 'audit') {
    runAudit()
    return
  }

  runNormalize({ dryRun: args.dryRun })
}

try {
  main()
} catch (error) {
  console.error(sanitizeMessage(error instanceof Error ? error.message : 'Falha inesperada.'))
  process.exitCode = 1
}

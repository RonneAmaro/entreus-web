/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const requiredFiles = [
  'lib/content-access.ts', 'lib/post-visibility.ts', 'lib/media/protected-post-media.ts',
  'lib/media/post-media-access.ts', 'app/api/post-media/[mediaId]/signed-url/route.ts',
  'app/components/ProtectedPostMedia.tsx', 'supabase/migrations/20260621_harden_adult_content_rls.sql',
  'supabase/migrations/20260621_add_post_media_storage_metadata.sql',
  'supabase/sql/verify-adult-content-rls.sql', 'supabase/sql/verify-post-media-storage-metadata.sql',
]
const requiredScripts = ['audit:adult-access', 'audit:adult-media', 'audit:rls:local', 'plan:adult-media-protection']

function collectPreflightChecks(projectRoot = root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  return [
    ...requiredFiles.map((file) => ({ name: file, status: fs.existsSync(path.join(projectRoot, file)) ? 'ok' : 'critical' })),
    ...requiredScripts.map((name) => ({ name: `script:${name}`, status: packageJson.scripts?.[name] ? 'ok' : 'critical' })),
  ]
}

function runAudit(name) {
  const command = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', `npm.cmd run ${name}`]]
    : ['npm', ['run', name]]
  const result = spawnSync(command[0], command[1], {
    cwd: root,
    encoding: 'utf8',
  })
  return { name: `run:${name}`, status: result.status === 0 ? 'ok' : 'critical' }
}

function main() {
  const checks = collectPreflightChecks()
  if (!checks.some((check) => check.status === 'critical')) requiredScripts.forEach((name) => checks.push(runAudit(name)))
  const summary = checks.reduce((acc, check) => { acc[check.status] += 1; return acc }, { ok: 0, warning: 0, critical: 0 })
  const report = { mode: 'local-only', summary, checks, note: 'No database rows, media URLs, keys, tokens, or secrets were read or reported.' }
  const reports = path.join(root, 'reports')
  fs.mkdirSync(reports, { recursive: true })
  fs.writeFileSync(path.join(reports, 'qa-18plus-private-media.json'), `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(path.join(reports, 'qa-18plus-private-media.md'), `# QA 18+ private media preflight\n\nSummary: ${JSON.stringify(summary)}.\n\n${checks.map((check) => `- ${check.status}: ${check.name}`).join('\n')}\n`)
  console.log(`18+ private media QA preflight complete: ${summary.ok} ok, ${summary.warning} warning, ${summary.critical} critical.`)
  process.exitCode = summary.critical ? 1 : 0
}

if (require.main === module) main()
module.exports = { collectPreflightChecks, requiredFiles, requiredScripts }

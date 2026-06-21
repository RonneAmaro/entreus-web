/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const migrations = path.join(root, 'supabase', 'migrations')
const reports = path.join(root, 'reports')
const critical = ['posts','post_media','comments','saved_posts','reposts','likes','reports','notifications','profiles','age_verification_requests','itacash_purchase_requests','message_attachments','meet_room_chat_messages','meet_room_message_attachments','internal_feedback_reports','storage.objects']
const tables = new Map(critical.map((name) => [name, { rls: false, policies: [], sources: [] }]))
const ensure = (name) => { const key = name.replace(/^public\./, '').toLowerCase(); if (!tables.has(key)) tables.set(key, { rls: false, policies: [], sources: [] }); return tables.get(key) }
const files = fs.readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort()
for (const file of files) {
  const source = fs.readFileSync(path.join(migrations, file), 'utf8')
  for (const m of source.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_]+)\s+enable\s+row\s+level\s+security/gi)) { const item = ensure(m[1]); item.rls = true; item.sources.push(file) }
  for (const m of source.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(?:(public|storage)\.)?([a-z_]+)/gi)) { const item = ensure(m[2] === 'storage' ? `storage.${m[3]}` : m[3]); item.policies.push(m[1]); item.sources.push(file) }
}
const findings = [...tables.entries()].map(([table, value]) => ({ table, rlsReferenced: value.rls, policies: [...new Set(value.policies)].sort(), sourceFiles: [...new Set(value.sources)].sort(), status: value.rls && value.policies.length ? 'documented' : value.rls ? 'needs-review' : 'not-found-in-migrations' }))
const summary = findings.reduce((a, f) => { a[f.status] += 1; return a }, { documented: 0, 'needs-review': 0, 'not-found-in-migrations': 0 })
fs.mkdirSync(reports, { recursive: true })
fs.writeFileSync(path.join(reports, 'rls-local-migrations-audit.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), scannedMigrationFiles: files.length, summary, findings }, null, 2)}\n`)
fs.writeFileSync(path.join(reports, 'rls-local-migrations-audit.md'), ['# Local RLS migrations audit', '', 'Static inventory only; it does not access Supabase, `.env`, database rows, post text, media, or secrets.', '', `Migrations scanned: ${files.length}. Documented: ${summary.documented}; needs review: ${summary['needs-review']}; not found: ${summary['not-found-in-migrations']}.`, '', '| Table | RLS referenced | Policies | Status |', '| --- | --- | --- | --- |', ...findings.map((f) => `| ${f.table} | ${f.rlsReferenced ? 'yes' : 'no'} | ${f.policies.length || '-'} | ${f.status} |`), ''].join('\n'))
console.log(`Local RLS audit complete: ${files.length} migrations scanned; ${findings.length} tracked tables reported.`)

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const reports = path.join(root, 'reports')
fs.mkdirSync(reports, { recursive: true })

const report = {
  mode: 'local-only',
  checks: [
    'adult media with missing storage_key',
    'adult media whose access_level is not adult_private',
    'adult media with a populated legacy media_url',
  ],
  message: 'No database was queried. Run aggregate-only verification in an approved environment; never print URLs, keys, post text, or personal data.',
}

fs.writeFileSync(path.join(reports, 'adult-media-protection-plan.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(
  path.join(reports, 'adult-media-protection-plan.md'),
  '# Adult media protection plan\n\nLocal-only dry run: no database, storage, URLs, files, or secrets were accessed. Future approved backfill must identify adult media missing `storage_key`, not using `adult_private`, or still carrying a legacy public URL. Use aggregate counts only, copy verified objects manually to protected storage, update metadata, then retire legacy public references.\n',
)
console.log('Adult media protection plan generated (local-only; no data queried).')

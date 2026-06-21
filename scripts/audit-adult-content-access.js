const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const reportDir = path.join(root, 'reports')
const ignored = new Set(['node_modules', '.next', '.git', 'reports'])
function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(full)
  }
  return files
}
const findings = walk(path.join(root, 'app')).concat(walk(path.join(root, 'lib')))
  .filter((file) => fs.readFileSync(file, 'utf8').includes(".from('posts')"))
  .map((file) => {
    const source = fs.readFileSync(file, 'utf8')
    const usesVisibilityHelper = source.includes('applyPostVisibilityFilters')
    const usesContentAccess = source.includes('content-access')
    const usesClassification = source.includes('post-classification')
    const hasCommunityFilter = /community_type/.test(source)
    const hasRatingFilter = /content_rating/.test(source)
    const status = usesVisibilityHelper || (hasCommunityFilter && hasRatingFilter) ? 'safe' : usesContentAccess || usesClassification ? 'needs-review' : 'potential-risk'
    return { file: path.relative(root, file).replace(/\\/g, '/'), status, signals: { community_type: hasCommunityFilter, content_rating: hasRatingFilter, content_access: usesContentAccess, post_classification: usesClassification, post_visibility: usesVisibilityHelper } }
  })
const summary = findings.reduce((acc, finding) => { acc[finding.status] += 1; return acc }, { safe: 0, 'needs-review': 0, 'potential-risk': 0 })
fs.mkdirSync(reportDir, { recursive: true })
fs.writeFileSync(path.join(reportDir, 'adult-content-access-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary, findings }, null, 2) + '\n')
const markdown = ['# Adult content access audit', '', 'This static audit records source-level signals only. It never reads database rows, post text, media URLs, credentials, or environment files.', '', `Summary: safe ${summary.safe}, needs-review ${summary['needs-review']}, potential-risk ${summary['potential-risk']}.`, '', '| File | Classification | community_type | content_rating | visibility helper |', '| --- | --- | --- | --- | --- |', ...findings.map((f) => `| ${f.file} | ${f.status} | ${f.signals.community_type ? 'yes' : 'no'} | ${f.signals.content_rating ? 'yes' : 'no'} | ${f.signals.post_visibility ? 'yes' : 'no'} |`), '']
fs.writeFileSync(path.join(reportDir, 'adult-content-access-audit.md'), markdown.join('\n'))
console.log(`Adult access audit complete: ${findings.length} post readers checked; reports/adult-content-access-audit.{json,md} generated.`)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

const root = resolve(process.cwd())
const exceptionFile = resolve(root, 'scripts/i18n-audit-exceptions.json')
const exceptionInventory = existsSync(exceptionFile)
  ? JSON.parse(readFileSync(exceptionFile, 'utf8'))
  : { strictRoutes: [], exceptions: [] }
const scanRoots = ['app', 'components', 'lib']
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const ignored = [
  /(?:^|\/)tests?\//,
  /(?:^|\/)lib\/i18n\/catalogs\//,
  /(?:^|\/)lib\/translations\.ts$/,
]
const portugueseSignal = /(?:[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|\b(?:você|vocês|não|nenhum|nenhuma|salvar|cancelar|excluir|editar|carregando|erro|tentar novamente|conta|perfil|configurações|publicar|comentários|comunidades|seguir|mensagem|compartilhar|denunciar|privacidade|segurança|notificações|idioma|português)\b)/i
const visibleAttribute = /\b(placeholder|title|aria-label|alt)\s*=\s*["']([^"'{}]+)["']/g
const jsxText = />([^<>{}\r\n]*[A-Za-zÀ-ÿ][^<>{}\r\n]*)</g
const visibleCall = /\b(setMessage|setError|setStatusMessage|alert|confirm|prompt|toast(?:\.\w+)?)\s*\(\s*["'`]([^"'`]+)["'`]/g

function extension(path) {
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot)
}

function filesUnder(path) {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    filesUnder(resolve(path, entry.name)),
  )
}

function lineAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length
}

function routeFor(file) {
  if (file === 'app/page.tsx') return '/'
  if (!file.startsWith('app/') || !file.endsWith('/page.tsx')) return null
  const route = file.slice(3, -'/page.tsx'.length)
    .replace(/\/\([^/]+\)/g, '')
    .replace(/\/+/g, '/')
  return route || '/'
}

function suggestedKey(file, text, kind) {
  const domain = file.split('/').filter(Boolean)[1] || 'common'
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('.')
  return `${domain}.${kind}.${slug || 'label'}`
}

function collect(source, regex, kind, file, requirePortuguese) {
  const findings = []
  for (const match of source.matchAll(regex)) {
    const text = match[2] ?? match[1]
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized || (requirePortuguese && !portugueseSignal.test(normalized))) continue
    if (/^(?:EntreUS|VIP|Pix|ItaCash|Creator Studio|[A-Z0-9+./ -]{1,18})$/.test(normalized)) continue
    findings.push({
      route: routeFor(file),
      file,
      line: lineAt(source, match.index ?? 0),
      text: normalized,
      reason: kind === 'jsx'
        ? 'texto JSX visível fora do i18n'
        : kind === 'message'
          ? 'mensagem visível em português fora do i18n'
          : `${match[1]} visível fora do i18n`,
      suggestedKey: suggestedKey(file, normalized, kind),
      status: 'pending',
    })
  }
  return findings
}

export function auditSources() {
  const files = scanRoots
    .map((directory) => resolve(root, directory))
    .filter((directory) => {
      try { return statSync(directory).isDirectory() } catch { return false }
    })
    .flatMap(filesUnder)
    .map((file) => relative(root, file).split(sep).join('/'))
    .filter((file) => extensions.has(extension(file)))
    .filter((file) => !ignored.some((pattern) => pattern.test(file)))

  const routes = files.filter((file) => file === 'app/page.tsx' || (file.startsWith('app/') && file.endsWith('/page.tsx')))
    .map((file) => ({ route: routeFor(file), file }))

  const findings = files.flatMap((file) => {
    const source = readFileSync(resolve(root, file), 'utf8')
    return [
      ...collect(source, jsxText, 'jsx', file, false),
      ...collect(source, visibleAttribute, 'attribute', file, false),
      ...collect(source, visibleCall, 'message', file, true),
    ]
  })

  const exceptionKey = (file, text) => `${file}\u0000${text}`
  const sourceByFile = new Map(files.map((file) => [
    file,
    readFileSync(resolve(root, file), 'utf8'),
  ]))
  const invalidExceptions = exceptionInventory.exceptions.filter((entry) =>
    !entry.file ||
    !entry.pattern ||
    !entry.text ||
    !entry.reason ||
    !entry.category ||
    !entry.comment ||
    !sourceByFile.get(entry.file)?.includes(entry.pattern),
  )
  const validExceptions = exceptionInventory.exceptions.filter((entry) => !invalidExceptions.includes(entry))
  const exceptionMap = new Map(validExceptions.map((entry) => [
    exceptionKey(entry.file, entry.text),
    entry,
  ]))
  const classifiedExceptions = findings
    .map((finding) => ({ finding, exception: exceptionMap.get(exceptionKey(finding.file, finding.text)) }))
    .filter((entry) => entry.exception)
  const classifiedKeys = new Set(classifiedExceptions.map(({ exception }) =>
    exceptionKey(exception.file, exception.text),
  ))
  const staleExceptions = validExceptions.filter((entry) =>
    !classifiedKeys.has(exceptionKey(entry.file, entry.text)),
  )
  const strictRoutes = new Set(exceptionInventory.strictRoutes)
  const unclassifiedStrict = findings.filter((finding) =>
    finding.route &&
    strictRoutes.has(finding.route) &&
    !exceptionMap.has(exceptionKey(finding.file, finding.text)),
  )

  return {
    files,
    routes,
    findings,
    strictRoutes: [...strictRoutes],
    classifiedExceptions,
    invalidExceptions,
    staleExceptions,
    unclassifiedStrict,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  const result = auditSources()
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result))
  } else {
    console.log(`# Auditoria automática de i18n\n`)
    console.log(`Rotas: ${result.routes.length}`)
    console.log(`Arquivos: ${result.files.length}`)
    console.log(`Ocorrências candidatas: ${result.findings.length}\n`)
    console.log(`Rotas em modo estrito: ${result.strictRoutes.join(', ') || '(nenhuma)'}`)
    console.log(`Exceções classificadas: ${result.classifiedExceptions.length}`)
    console.log(`Exceções inválidas: ${result.invalidExceptions.length}`)
    console.log(`Exceções obsoletas: ${result.staleExceptions.length}`)
    console.log(`Ocorrências não classificadas no escopo estrito: ${result.unclassifiedStrict.length}\n`)
    for (const item of result.findings) {
      console.log(`- rota: ${item.route ?? '(componente compartilhado)'}`)
      console.log(`  arquivo: ${item.file}:${item.line}`)
      console.log(`  texto: ${item.text}`)
      console.log(`  motivo: ${item.reason}`)
      console.log(`  chave sugerida: ${item.suggestedKey}`)
      console.log(`  status: ${item.status}`)
    }
  }
  if (
    process.argv.includes('--strict') &&
    (result.unclassifiedStrict.length || result.invalidExceptions.length || result.staleExceptions.length)
  ) process.exitCode = 1
}

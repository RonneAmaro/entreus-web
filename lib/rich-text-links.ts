export type RichTextToken =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; username: string }
  | { type: 'community'; value: string; slug: string }

const COMMUNITY_ALIASES: Record<string, string> = {
  geral: 'general',
  general: 'general',
  esporte: 'sports',
  esportes: 'sports',
  sport: 'sports',
  sports: 'sports',
  geopolitica: 'geopolitics',
  geopolitics: 'geopolitics',
  militar: 'military',
  military: 'military',
  adulto: 'adult_18plus',
  adult: 'adult_18plus',
  '18plus': 'adult_18plus',
  '18-plus': 'adult_18plus',
  'adult-18plus': 'adult_18plus',
  adult_18plus: 'adult_18plus',
  'conteudo-adulto': 'adult_18plus',
  conteudo_adulto: 'adult_18plus',
}

function isAsciiLetterOrNumber(char: string) {
  return /[A-Za-z0-9]/.test(char)
}

function isMentionStart(char: string) {
  return /[A-Za-z0-9_]/.test(char)
}

function isMentionChar(char: string) {
  return /[A-Za-z0-9._-]/.test(char)
}

function isUnicodeLetterOrNumber(char: string) {
  return /[\p{L}\p{N}]/u.test(char)
}

function isHashtagStart(char: string) {
  return isUnicodeLetterOrNumber(char)
}

function isHashtagChar(char: string) {
  return isUnicodeLetterOrNumber(char) || char === '_' || char === '-'
}

function getCodePointChar(text: string, index: number) {
  const point = text.codePointAt(index)
  if (point === undefined) return null

  return String.fromCodePoint(point)
}

function getUrlRanges(text: string) {
  const ranges: { start: number; end: number }[] = []
  const urlRegex = /https?:\/\/[^\s<]+/gi
  let match: RegExpExecArray | null

  while ((match = urlRegex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }

  return ranges
}

function isInRange(index: number, ranges: { start: number; end: number }[]) {
  return ranges.some((range) => index >= range.start && index < range.end)
}

function canStartRichToken(text: string, index: number) {
  if (index === 0) return true

  const previous = getCodePointChar(text, index - 1) || ''

  if (isAsciiLetterOrNumber(previous)) return false
  return !['_', '.', '-', '/', ':', '@', '#', '?', '&', '=', '%'].includes(previous)
}

function readMention(text: string, markerIndex: number) {
  const start = markerIndex + 1
  const first = getCodePointChar(text, start)
  if (!first || !isMentionStart(first)) return null

  let end = start
  while (end < text.length) {
    const char = getCodePointChar(text, end)
    if (!char || !isMentionChar(char)) break
    end += char.length
  }

  const rawUsername = text.slice(start, end)
  const username = rawUsername.replace(/\.+$/g, '')
  if (!username) return null

  return {
    end: start + username.length,
    token: {
      type: 'mention' as const,
      value: `@${username}`,
      username,
    },
  }
}

export function normalizeCommunitySlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
}

export function resolveCommunityFilterSlug(value: string) {
  const slug = normalizeCommunitySlug(value.replace(/^#/, ''))

  return COMMUNITY_ALIASES[slug] || slug
}

function readCommunity(text: string, markerIndex: number) {
  const start = markerIndex + 1
  const first = getCodePointChar(text, start)
  if (!first || !isHashtagStart(first)) return null

  let end = start
  while (end < text.length) {
    const char = getCodePointChar(text, end)
    if (!char || !isHashtagChar(char)) break
    end += char.length
  }

  const rawSlug = text.slice(start, end)
  const slug = resolveCommunityFilterSlug(rawSlug)
  if (!slug) return null

  return {
    end,
    token: {
      type: 'community' as const,
      value: `#${rawSlug}`,
      slug,
    },
  }
}

function pushTextToken(tokens: RichTextToken[], value: string) {
  if (!value) return

  const last = tokens[tokens.length - 1]
  if (last?.type === 'text') {
    last.value += value
    return
  }

  tokens.push({ type: 'text', value })
}

export function parseRichTextLinks(text: string): RichTextToken[] {
  const tokens: RichTextToken[] = []
  const urlRanges = getUrlRanges(text)
  let plainText = ''
  let index = 0

  while (index < text.length) {
    const char = getCodePointChar(text, index)
    if (!char) break

    const canParseMarker =
      (char === '@' || char === '#') &&
      !isInRange(index, urlRanges) &&
      canStartRichToken(text, index)

    if (canParseMarker) {
      const result = char === '@' ? readMention(text, index) : readCommunity(text, index)

      if (result) {
        pushTextToken(tokens, plainText)
        plainText = ''
        tokens.push(result.token)
        index = result.end
        continue
      }
    }

    plainText += char
    index += char.length
  }

  pushTextToken(tokens, plainText)

  return tokens
}

export function getMentionHref(username: string) {
  return `/u/${encodeURIComponent(username)}`
}

export function getCommunityHref(slug: string) {
  return `/feed?community=${encodeURIComponent(slug)}`
}

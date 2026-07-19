import type { Locale } from './config'

const WORDS: Record<Locale, Set<string>> = {
  'pt-BR': new Set(['a', 'ao', 'com', 'como', 'da', 'de', 'do', 'e', 'em', 'esta', 'não', 'o', 'para', 'por', 'que', 'se', 'uma', 'você']),
  en: new Set(['a', 'and', 'are', 'as', 'at', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'that', 'the', 'this', 'to', 'you']),
  es: new Set(['a', 'al', 'como', 'con', 'de', 'el', 'en', 'es', 'esta', 'la', 'las', 'los', 'no', 'para', 'por', 'que', 'se', 'una']),
  fr: new Set(['avec', 'dans', 'de', 'des', 'du', 'est', 'et', 'la', 'le', 'les', 'pas', 'pour', 'que', 'une', 'vous']),
  id: new Set(['ada', 'anda', 'dan', 'dari', 'di', 'ini', 'itu', 'ke', 'pada', 'untuk', 'yang']),
  ko: new Set(['그리고', '그', '이', '있는', '저는', '합니다']),
  ja: new Set(['この', 'これ', 'です', 'と', 'に', 'の', 'は', 'を']),
  'zh-CN': new Set(['一个', '不', '与', '了', '在', '是', '的', '这']),
}

export function detectContentLocale(content: string): Locale | null {
  const words = content.toLocaleLowerCase().match(/\p{L}+/gu) ?? []
  if (words.length < 3 || content.trim().length < 12) return null

  const scores = (Object.keys(WORDS) as Locale[]).map((locale) => ({
    locale,
    score: words.reduce((total, word) => total + (WORDS[locale].has(word) ? 1 : 0), 0),
  })).sort((left, right) => right.score - left.score)

  if (scores[0].score < 2 || scores[0].score === scores[1].score) return null
  return scores[0].locale
}

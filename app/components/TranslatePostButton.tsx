'use client'

import { useRef, useState } from 'react'
import { Languages, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { detectContentLocale } from '@/lib/i18n/content-language'
import { useLanguage } from './LanguageProvider'

type TranslatePostButtonProps = {
  postId: string
  content: string | null
  contentLocale?: string | null
}
const sessionTranslationCache = new Map<string, string>()

export default function TranslatePostButton({
  postId,
  content,
  contentLocale,
}: TranslatePostButtonProps) {
  const { t, language, languages } = useLanguage()
  const [translatedText, setTranslatedText] = useState('')
  const [showTranslation, setShowTranslation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inFlightRef = useRef(false)
  const cleanContent = content?.trim() || ''
  const detectedLocale = contentLocale || detectContentLocale(cleanContent)
  const targetLabel = languages.find((option) => option.code === language)?.nativeName ?? language

  if (!cleanContent || detectedLocale === language) return null

  async function translatePost() {
    if (inFlightRef.current) return
    if (translatedText) {
      setShowTranslation(true)
      return
    }

    inFlightRef.current = true
    setLoading(true)
    setError('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('authentication')

      const cacheKey = `${session.user.id}:post:${postId}:${language}`
      const cached = sessionTranslationCache.get(cacheKey)
      if (cached) {
        setTranslatedText(cached)
        setShowTranslation(true)
        return
      }

      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          contentType: 'post',
          contentId: postId,
          targetLanguage: language,
        }),
      })
      const data = await response.json().catch(() => null) as { translatedText?: string; error?: string } | null
      if (!response.ok || !data?.translatedText) {
        setError(data?.error || t('translate.error'))
        return
      }

      sessionTranslationCache.set(cacheKey, data.translatedText)
      setTranslatedText(data.translatedText)
      setShowTranslation(true)
    } catch {
      setError(t('translate.error'))
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  return (
    <div className="relative mb-4">
      <button
        type="button"
        onClick={() => {
          if (showTranslation) setShowTranslation(false)
          else void translatePost()
        }}
        disabled={loading}
        aria-expanded={showTranslation}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/60"
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          : <Languages className="h-4 w-4" />}
        {loading
          ? t('translate.loading')
          : showTranslation
            ? t('translate.original')
            : translatedText
              ? t('translate.show')
              : t('translate.action')}
      </button>

      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-600 dark:text-red-300">{error}</p>}

      {showTranslation && translatedText && (
        <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-zinc-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-zinc-200">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            {t('translate.result', { language: targetLabel })}
          </p>
          <p className="whitespace-pre-wrap break-words">{translatedText}</p>
        </div>
      )}
    </div>
  )
}

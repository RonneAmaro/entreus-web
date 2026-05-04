'use client'

import { useState } from 'react'
import { ChevronUp, Languages, Loader2 } from 'lucide-react'

type TranslatePostButtonProps = {
  content: string | null
  targetLanguage?: string
}

function getBrowserLanguage() {
  if (typeof navigator === 'undefined') return 'pt'

  const language = navigator.language || 'pt-BR'
  return language.split('-')[0] || 'pt'
}

export default function TranslatePostButton({
  content,
  targetLanguage,
}: TranslatePostButtonProps) {
  const [translatedText, setTranslatedText] = useState('')
  const [showTranslation, setShowTranslation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cleanContent = content?.trim() || ''

  if (!cleanContent) return null

  async function handleTranslate() {
    if (translatedText) {
      setShowTranslation((current) => !current)
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanContent,
          targetLanguage: targetLanguage || getBrowserLanguage(),
          sourceLanguage: 'auto',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data?.error || 'Não foi possível traduzir agora.')
        return
      }

      setTranslatedText(data?.translatedText || '')
      setShowTranslation(true)
    } catch {
      setError('Erro de conexão ao tentar traduzir.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={handleTranslate}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/60"
        title={translatedText && showTranslation ? 'Ocultar tradução' : 'Traduzir publicação'}
        aria-label={translatedText && showTranslation ? 'Ocultar tradução' : 'Traduzir publicação'}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : translatedText && showTranslation ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <Languages className="h-4 w-4" />
        )}

        <span>
          {loading
            ? 'Traduzindo...'
            : translatedText && showTranslation
              ? 'Ocultar tradução'
              : translatedText
                ? 'Mostrar tradução'
                : 'Traduzir'}
        </span>
      </button>

      {error && (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}

      {showTranslation && translatedText && (
        <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-zinc-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-zinc-200">
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            <Languages className="h-3.5 w-3.5" />
            Tradução
          </div>

          <p className="whitespace-pre-wrap break-words">
            {translatedText}
          </p>
        </div>
      )}
    </div>
  )
}

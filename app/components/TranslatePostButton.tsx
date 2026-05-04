'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Languages, Loader2 } from 'lucide-react'

type TranslatePostButtonProps = {
  content: string | null
  targetLanguage?: string
}

type LanguageOption = {
  code: string
  label: string
  flag: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'Inglês', flag: '🇺🇸' },
  { code: 'es', label: 'Espanhol', flag: '🇪🇸' },
  { code: 'id', label: 'Indonésio', flag: '🇮🇩' },
  { code: 'ko', label: 'Coreano', flag: '🇰🇷' },
  { code: 'fr', label: 'Francês', flag: '🇫🇷' },
]

function getBrowserLanguage() {
  if (typeof navigator === 'undefined') return 'pt'

  const language = navigator.language || 'pt-BR'
  return language.split('-')[0] || 'pt'
}

function getDefaultLanguage(targetLanguage?: string) {
  const preferred = targetLanguage || getBrowserLanguage()
  const normalized = preferred.split('-')[0]?.toLowerCase() || 'pt'

  return LANGUAGE_OPTIONS.some((language) => language.code === normalized)
    ? normalized
    : 'pt'
}

function getLanguageLabel(code: string) {
  const language = LANGUAGE_OPTIONS.find((item) => item.code === code)
  return language ? `${language.flag} ${language.label}` : code.toUpperCase()
}

export default function TranslatePostButton({
  content,
  targetLanguage,
}: TranslatePostButtonProps) {
  const [selectedLanguage, setSelectedLanguage] = useState(() =>
    getDefaultLanguage(targetLanguage)
  )
  const [translatedText, setTranslatedText] = useState('')
  const [translatedLanguage, setTranslatedLanguage] = useState('')
  const [showTranslation, setShowTranslation] = useState(false)
  const [openLanguageMenu, setOpenLanguageMenu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cleanContent = content?.trim() || ''

  if (!cleanContent) return null

  async function translateTo(languageCode: string) {
    if (loading) return

    if (translatedText && translatedLanguage === languageCode) {
      setShowTranslation(true)
      setOpenLanguageMenu(false)
      return
    }

    setSelectedLanguage(languageCode)
    setLoading(true)
    setError('')
    setOpenLanguageMenu(false)

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanContent,
          targetLanguage: languageCode,
          sourceLanguage: 'auto',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data?.error || 'Não foi possível traduzir agora.')
        return
      }

      setTranslatedText(data?.translatedText || '')
      setTranslatedLanguage(languageCode)
      setShowTranslation(true)
    } catch {
      setError('Erro de conexão ao tentar traduzir.')
    } finally {
      setLoading(false)
    }
  }

  function handleMainButtonClick() {
    if (translatedText && showTranslation) {
      setShowTranslation(false)
      return
    }

    if (translatedText && translatedLanguage === selectedLanguage) {
      setShowTranslation(true)
      return
    }

    setOpenLanguageMenu((current) => !current)
  }

  return (
    <div className="relative mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleMainButtonClick}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/60"
          title={
            translatedText && showTranslation
              ? 'Ocultar tradução'
              : 'Escolher idioma da tradução'
          }
          aria-label={
            translatedText && showTranslation
              ? 'Ocultar tradução'
              : 'Escolher idioma da tradução'
          }
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

        <button
          type="button"
          onClick={() => setOpenLanguageMenu((current) => !current)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          title="Escolher idioma"
          aria-label="Escolher idioma"
        >
          <span>{getLanguageLabel(selectedLanguage)}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {openLanguageMenu && (
        <div className="absolute left-0 top-10 z-30 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Traduzir para
          </p>

          <div className="space-y-1">
            {LANGUAGE_OPTIONS.map((language) => (
              <button
                key={language.code}
                type="button"
                onClick={() => translateTo(language.code)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                  selectedLanguage === language.code
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'
                }`}
              >
                <span>
                  {language.flag} {language.label}
                </span>

                {selectedLanguage === language.code && (
                  <span className="text-xs font-bold">Atual</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}

      {showTranslation && translatedText && (
        <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-zinc-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-zinc-200">
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            <Languages className="h-3.5 w-3.5" />
            Tradução para {getLanguageLabel(translatedLanguage || selectedLanguage)}
          </div>

          <p className="whitespace-pre-wrap break-words">{translatedText}</p>
        </div>
      )}
    </div>
  )
}
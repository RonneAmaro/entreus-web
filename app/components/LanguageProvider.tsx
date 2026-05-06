'use client'

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { languageOptions, translations, type LanguageCode, type LanguageOption } from '@/lib/translations'

type LanguageContextValue = {
  language: LanguageCode
  languages: LanguageOption[]
  setLanguage: (language: LanguageCode) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)
const STORAGE_KEY = 'entreus-language'

function isLanguageCode(value: string | null): value is LanguageCode {
  return !!value && Object.keys(translations).includes(value)
}

function getNestedValue(dictionary: unknown, key: string) {
  let current = dictionary

  for (const part of key.split('.')) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return null
    }
  }

  return typeof current === 'string' ? current : null
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('pt')

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)

    if (isLanguageCode(saved)) {
      setLanguageState(saved)
      return
    }

    const browserLanguage = window.navigator.language.toLowerCase()

    if (browserLanguage.startsWith('en')) setLanguageState('en')
    else if (browserLanguage.startsWith('fr')) setLanguageState('fr')
    else if (browserLanguage.startsWith('id')) setLanguageState('id')
    else if (browserLanguage.startsWith('ja')) setLanguageState('ja')
    else if (browserLanguage.startsWith('zh')) setLanguageState('zh')
  }, [])

  useEffect(() => {
    const option = languageOptions.find((item) => item.code === language)
    document.documentElement.lang = option?.htmlLang || 'pt-BR'
  }, [language])

  function setLanguage(nextLanguage: LanguageCode) {
    setLanguageState(nextLanguage)
    window.localStorage.setItem(STORAGE_KEY, nextLanguage)
  }

  const value = useMemo<LanguageContextValue>(() => {
    function t(key: string) {
      return (
        getNestedValue(translations[language], key) ||
        getNestedValue(translations.pt, key) ||
        key
      )
    }

    return {
      language,
      languages: languageOptions,
      setLanguage,
      t,
    }
  }, [language])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useLanguage precisa ser usado dentro de LanguageProvider.')
  }

  return context
}

import { NextResponse } from 'next/server'

type MyMemoryResponse = {
  responseData?: {
    translatedText?: string
    match?: number
  }
  responseStatus?: number
  responseDetails?: string
  matches?: Array<{
    translation?: string
  }>
}

function normalizeLanguage(language: string) {
  const clean = language.trim().toLowerCase()

  if (!clean || clean === 'auto') return 'auto'

  const map: Record<string, string> = {
    'pt-br': 'pt',
    'pt-pt': 'pt',
    br: 'pt',
    portuguese: 'pt',
    portugues: 'pt',
    português: 'pt',
    english: 'en',
    ingles: 'en',
    inglês: 'en',
    spanish: 'es',
    espanhol: 'es',
    korean: 'ko',
    coreano: 'ko',
    indonesian: 'id',
    indonesio: 'id',
    indonésio: 'id',
    french: 'fr',
    frances: 'fr',
    francês: 'fr',
  }

  if (map[clean]) return map[clean]

  return clean.split('-')[0] || 'pt'
}

function getFallbackSourceLanguage(targetLanguage: string) {
  // O MyMemory precisa de langpair.
  // Como o botão manda sourceLanguage "auto", usamos um fallback simples.
  // Para maioria dos seus posts atuais, pt funciona bem.
  if (targetLanguage === 'pt') return 'en'
  return 'pt'
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const text = String(body?.text || '').trim()
    const targetLanguage = normalizeLanguage(String(body?.targetLanguage || 'pt'))
    const requestedSourceLanguage = normalizeLanguage(
      String(body?.sourceLanguage || 'auto')
    )

    if (!text) {
      return NextResponse.json(
        { error: 'Texto vazio para tradução.' },
        { status: 400 }
      )
    }

    if (text.length > 4500) {
      return NextResponse.json(
        {
          error:
            'Este texto está muito grande para tradução gratuita agora. Tente traduzir uma publicação menor.',
        },
        { status: 413 }
      )
    }

    const sourceLanguage =
      requestedSourceLanguage === 'auto'
        ? getFallbackSourceLanguage(targetLanguage)
        : requestedSourceLanguage

    if (sourceLanguage === targetLanguage) {
      return NextResponse.json(
        {
          error:
            'O idioma de origem e destino ficaram iguais. Tente mudar o idioma do navegador ou traduzir um texto em outro idioma.',
        },
        { status: 400 }
      )
    }

    const contactEmail = process.env.TRANSLATE_CONTACT_EMAIL || ''
    const langpair = `${sourceLanguage}|${targetLanguage}`

    const url = new URL('https://api.mymemory.translated.net/get')
    url.searchParams.set('q', text)
    url.searchParams.set('langpair', langpair)

    if (contactEmail) {
      url.searchParams.set('de', contactEmail)
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    const data = (await response.json().catch(() => null)) as MyMemoryResponse | null

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            data?.responseDetails ||
            'Não foi possível traduzir este texto agora.',
        },
        { status: response.status }
      )
    }

    if (data?.responseStatus && data.responseStatus >= 400) {
      return NextResponse.json(
        {
          error:
            data.responseDetails ||
            'O serviço gratuito de tradução não conseguiu traduzir agora.',
        },
        { status: 502 }
      )
    }

    const translatedText =
      data?.responseData?.translatedText ||
      data?.matches?.find((match) => match.translation)?.translation ||
      ''

    if (!translatedText) {
      return NextResponse.json(
        { error: 'O serviço de tradução não retornou texto traduzido.' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      translatedText,
      targetLanguage,
      sourceLanguage,
      provider: 'mymemory',
    })
  } catch (error) {
    console.error('Erro na rota de tradução:', error)

    return NextResponse.json(
      { error: 'Erro interno ao traduzir o texto.' },
      { status: 500 }
    )
  }
}
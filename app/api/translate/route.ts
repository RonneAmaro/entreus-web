import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const text = String(body?.text || '').trim()
    const targetLanguage = String(body?.targetLanguage || 'pt').trim() || 'pt'
    const sourceLanguage = String(body?.sourceLanguage || 'auto').trim() || 'auto'

    if (!text) {
      return NextResponse.json(
        { error: 'Texto vazio para tradução.' },
        { status: 400 }
      )
    }

    const apiUrl = process.env.TRANSLATE_API_URL
    const apiKey = process.env.TRANSLATE_API_KEY

    if (!apiUrl) {
      return NextResponse.json(
        {
          error:
            'Tradutor ainda não configurado. Defina TRANSLATE_API_URL no .env.local.',
        },
        { status: 501 }
      )
    }

    const endpoint = `${apiUrl.replace(/\/$/, '')}/translate`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: text,
        source: sourceLanguage,
        target: targetLanguage,
        format: 'text',
        ...(apiKey ? { api_key: apiKey } : {}),
      }),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            data?.error ||
            data?.message ||
            'Não foi possível traduzir este texto agora.',
        },
        { status: response.status }
      )
    }

    const translatedText =
      data?.translatedText ||
      data?.translation ||
      data?.translated_text ||
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
    })
  } catch (error) {
    console.error('Erro na rota de tradução:', error)

    return NextResponse.json(
      { error: 'Erro interno ao traduzir o texto.' },
      { status: 500 }
    )
  }
}

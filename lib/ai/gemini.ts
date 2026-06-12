const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_TIMEOUT_MS = 15000

type GeminiPart = {
  text?: string
}

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[]
  }
}

type GeminiResponse = {
  candidates?: GeminiCandidate[]
}

export class GeminiError extends Error {
  safeMessage: string
  status: number

  constructor(safeMessage: string, status = 502) {
    super(safeMessage)
    this.name = 'GeminiError'
    this.safeMessage = safeMessage
    this.status = status
  }
}

function readRequiredEnv(name: string) {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getGeminiModel() {
  return readRequiredEnv('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL
}

function sanitizeGeminiText(value: string) {
  let text = value.trim()

  text = text.replace(/^```(?:\w+)?\s*/i, '').replace(/\s*```$/i, '').trim()
  text = text.replace(/^(texto\s+(final\s+)?(melhorado|revisado)|resposta):\s*/i, '').trim()

  const quotePairs = [
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
  ] as const

  for (const [open, close] of quotePairs) {
    if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
      text = text.slice(1, -1).trim()
      break
    }
  }

  return text
}

function extractText(data: GeminiResponse | null) {
  const parts = data?.candidates?.[0]?.content?.parts || []
  return parts
    .map((part) => part.text)
    .filter((part): part is string => Boolean(part))
    .join('\n')
}

export async function callGeminiText(prompt: string): Promise<string> {
  const apiKey = readRequiredEnv('GEMINI_API_KEY')

  if (!apiKey) {
    throw new GeminiError('IA nao configurada no servidor.', 503)
  }

  if (!prompt.trim()) {
    throw new GeminiError('Prompt vazio para a IA.', 400)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
  const model = getGeminiModel()
  const url = `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent`

  let response: Response

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 768,
          temperature: 0.4,
        },
      }),
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeminiError('A IA demorou para responder. Tente novamente.', 504)
    }

    throw new GeminiError('Nao foi possivel falar com a IA agora.', 502)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new GeminiError('Nao foi possivel gerar o texto agora.', 502)
  }

  const data = (await response.json().catch(() => null)) as GeminiResponse | null
  const result = sanitizeGeminiText(extractText(data))

  if (!result) {
    throw new GeminiError('A IA nao retornou texto.', 502)
  }

  return result
}

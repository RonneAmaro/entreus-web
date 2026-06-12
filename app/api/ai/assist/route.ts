import { NextResponse } from 'next/server'
import { callGeminiText, GeminiError } from '@/lib/ai/gemini'
import { buildImprovePostPrompt } from '@/lib/ai/prompts'
import { requireUser } from '@/lib/meet-server'
import type { AiAssistMode, AiAssistRequest, AiAssistResponse } from '@/lib/ai/types'

export const runtime = 'nodejs'

const MIN_TEXT_LENGTH = 3
const MAX_TEXT_LENGTH = 1200
const MAX_INVISIBLE_CHARACTERS = 20
const MAX_INVISIBLE_CHARACTER_RATIO = 0.1
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 10
const INVALID_JSON = Symbol('invalid-json')
const ALLOWED_MODES = new Set<AiAssistMode>(['improve_post'])
const LOGIN_REQUIRED_ERROR = 'Faca login para usar a IA da EntreUS.'
const TEMPORARY_RATE_LIMIT_ERROR =
  'Voce atingiu o limite temporario de uso da IA. Tente novamente em alguns minutos.'
const AI_UNAVAILABLE_ERROR =
  'Nao foi possivel usar a IA agora. Tente novamente em instantes.'
const INVISIBLE_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g

type RateLimitEntry = {
  count: number
  resetAt: number
}

const aiAssistRateLimits = new Map<string, RateLimitEntry>()

type TextValidation =
  | {
      ok: true
      text: string
    }
  | {
      ok: false
      error: string
      status: number
    }

function jsonResponse(body: AiAssistResponse, status = 200) {
  return NextResponse.json(body, { status })
}

function jsonError(error: string, status = 400) {
  return jsonResponse({ ok: false, error }, status)
}

async function readJsonBody(request: Request) {
  try {
    return (await request.json()) as unknown
  } catch {
    return INVALID_JSON
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAllowedMode(mode: unknown): mode is AiAssistMode {
  return typeof mode === 'string' && ALLOWED_MODES.has(mode as AiAssistMode)
}

function countInvisibleCharacters(value: string) {
  return value.match(INVISIBLE_CHARACTER_PATTERN)?.length ?? 0
}

function normalizeUserText(value: string) {
  return value
    .replace(INVISIBLE_CHARACTER_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function validateText(value: unknown): TextValidation {
  if (typeof value !== 'string') {
    return { ok: false, error: 'O campo text deve ser uma string.', status: 400 }
  }

  const invisibleCharacters = countInvisibleCharacters(value)

  if (
    invisibleCharacters > MAX_INVISIBLE_CHARACTERS ||
    invisibleCharacters > value.length * MAX_INVISIBLE_CHARACTER_RATIO
  ) {
    return {
      ok: false,
      error: 'O texto contem caracteres invalidos demais.',
      status: 400,
    }
  }

  const text = normalizeUserText(value)

  if (!text) {
    return { ok: false, error: 'Informe um texto para melhorar.', status: 400 }
  }

  if (text.length < MIN_TEXT_LENGTH) {
    return { ok: false, error: 'O texto e muito curto para melhorar.', status: 400 }
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      error: `O texto e muito longo. Use ate ${MAX_TEXT_LENGTH} caracteres.`,
      status: 413,
    }
  }

  return { ok: true, text }
}

function cleanupExpiredRateLimits(now: number) {
  for (const [userId, entry] of aiAssistRateLimits.entries()) {
    if (entry.resetAt <= now) {
      aiAssistRateLimits.delete(userId)
    }
  }
}

function checkRateLimit(userId: string) {
  const now = Date.now()
  const current = aiAssistRateLimits.get(userId)

  if (!current || current.resetAt <= now) {
    if (aiAssistRateLimits.size > 1000) {
      cleanupExpiredRateLimits(now)
    }

    aiAssistRateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    })

    return true
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false
  }

  current.count += 1
  return true
}

function getSafeUserRef(userId: string) {
  return userId.slice(0, 8)
}

export async function GET() {
  return jsonError('Use POST para acessar a assistente de IA.', 405)
}

export async function POST(request: Request) {
  if (request.method !== 'POST') {
    return jsonError('Metodo nao permitido.', 405)
  }

  const auth = await requireUser(request)

  if ('error' in auth) {
    return jsonError(LOGIN_REQUIRED_ERROR, 401)
  }

  const body = await readJsonBody(request)

  if (body === INVALID_JSON) {
    return jsonError('JSON invalido.', 400)
  }

  if (!isRecord(body)) {
    return jsonError('O corpo da requisicao deve ser um objeto JSON.', 400)
  }

  const payload = body as AiAssistRequest

  if (payload.mode === undefined) {
    return jsonError('Modo de IA obrigatorio.', 400)
  }

  if (!isAllowedMode(payload.mode)) {
    return jsonError('Modo de IA nao suportado.', 400)
  }

  if (payload.text === undefined) {
    return jsonError('Texto obrigatorio.', 400)
  }

  const textValidation = validateText(payload.text)

  if (!textValidation.ok) {
    return jsonError(textValidation.error, textValidation.status)
  }

  // Protecao temporaria em memoria para o MVP.
  // Em serverless, a janela pode resetar entre instancias; substituir por DB/Redis depois.
  if (!checkRateLimit(auth.user.id)) {
    return jsonError(TEMPORARY_RATE_LIMIT_ERROR, 429)
  }

  try {
    const result = await callGeminiText(buildImprovePostPrompt(textValidation.text))

    return jsonResponse({ ok: true, result })
  } catch (error) {
    if (error instanceof GeminiError) {
      return jsonError(AI_UNAVAILABLE_ERROR, error.status)
    }

    console.error(
      'Erro inesperado na rota de IA:',
      {
        user: getSafeUserRef(auth.user.id),
        mode: payload.mode,
        textLength: textValidation.text.length,
        error: error instanceof Error ? error.message : 'erro desconhecido',
      },
    )

    return jsonError(AI_UNAVAILABLE_ERROR, 500)
  }
}

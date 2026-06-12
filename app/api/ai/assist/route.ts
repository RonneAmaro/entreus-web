import { NextResponse } from 'next/server'
import { callGeminiText, GeminiError } from '@/lib/ai/gemini'
import { buildImprovePostPrompt } from '@/lib/ai/prompts'
import type { AiAssistMode, AiAssistRequest, AiAssistResponse } from '@/lib/ai/types'

export const runtime = 'nodejs'

const MIN_TEXT_LENGTH = 3
const MAX_TEXT_LENGTH = 1200
const INVALID_JSON = Symbol('invalid-json')
const ALLOWED_MODES = new Set<AiAssistMode>(['improve_post'])

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

function validateText(value: unknown): TextValidation {
  if (typeof value !== 'string') {
    return { ok: false, error: 'O campo text deve ser uma string.', status: 400 }
  }

  const text = value.trim()

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

export async function GET() {
  return jsonError('Use POST para acessar a assistente de IA.', 405)
}

export async function POST(request: Request) {
  if (request.method !== 'POST') {
    return jsonError('Metodo nao permitido.', 405)
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

  // TODO: Exigir usuario autenticado antes de liberar esta rota em producao.
  // A validacao foi adiada para nao acoplar este pacote ao Supabase pausado.
  try {
    const result = await callGeminiText(buildImprovePostPrompt(textValidation.text))

    return jsonResponse({ ok: true, result })
  } catch (error) {
    if (error instanceof GeminiError) {
      return jsonError(error.safeMessage, error.status)
    }

    console.error(
      'Erro na rota de IA:',
      error instanceof Error ? error.message : 'erro desconhecido',
    )

    return jsonError('Nao foi possivel processar o texto agora.', 500)
  }
}

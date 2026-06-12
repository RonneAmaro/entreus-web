export type AiAssistMode = 'improve_post'

export type AiAssistRequest = {
  mode?: unknown
  text?: unknown
}

export type AiAssistSuccessResponse = {
  ok: true
  result: string
}

export type AiAssistErrorResponse = {
  ok: false
  error: string
}

export type AiAssistResponse = AiAssistSuccessResponse | AiAssistErrorResponse

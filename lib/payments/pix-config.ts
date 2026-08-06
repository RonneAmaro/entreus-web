import { normalizePixText, validatePixKey } from './pix-brcode'

export type PixKeyType = 'email' | 'phone' | 'cpf' | 'cnpj' | 'random'
export type PixConfigurationError = 'pix_configuration_missing' | 'pix_key_invalid' | 'pix_receiver_invalid'
export type PixConfiguration = { pixKey: string; receiverName: string; receiverCity: string }
export type PixConfigurationInspection = {
  keyPresent: boolean
  keyType: PixKeyType | 'unrecognized' | null
  receiverNamePresent: boolean
  receiverCityPresent: boolean
  valid: boolean
  code: PixConfigurationError | null
}

export function recognizePixKeyType(value: string): PixKeyType | null {
  const key = value.trim()
  if (/^[^\s]+@[^\s]+\.[^\s]+$/.test(key)) return 'email'
  if (/^\+\d{10,15}$/.test(key)) return 'phone'
  if (/^\d{11}$/.test(key)) return 'cpf'
  if (/^\d{14}$/.test(key)) return 'cnpj'
  if (/^[0-9a-f]{32}$/i.test(key) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return 'random'
  return null
}

export function inspectPixConfiguration(env: NodeJS.ProcessEnv = process.env): PixConfigurationInspection {
  const pixKey = env.PIX_KEY?.trim() || ''
  const rawName = env.PIX_RECEIVER_NAME?.trim() || ''
  const rawCity = env.PIX_RECEIVER_CITY?.trim() || ''
  const keyType = recognizePixKeyType(pixKey)
  const receiverName = normalizePixText(rawName, 25)
  const receiverCity = normalizePixText(rawCity, 15)
  let code: PixConfigurationError | null = null

  if (!pixKey || !rawName || !rawCity) code = 'pix_configuration_missing'
  else if (!keyType || !validatePixKey(pixKey)) code = 'pix_key_invalid'
  else if (!receiverName || !receiverCity) code = 'pix_receiver_invalid'

  return {
    keyPresent: Boolean(pixKey),
    keyType: pixKey ? keyType || 'unrecognized' : null,
    receiverNamePresent: Boolean(rawName),
    receiverCityPresent: Boolean(rawCity),
    valid: !code,
    code,
  }
}

export function resolvePixConfiguration(env: NodeJS.ProcessEnv = process.env):
  | { ok: true; config: PixConfiguration; inspection: PixConfigurationInspection }
  | { ok: false; code: PixConfigurationError; inspection: PixConfigurationInspection } {
  const inspection = inspectPixConfiguration(env)
  if (!inspection.valid) return { ok: false, code: inspection.code!, inspection }
  return {
    ok: true,
    config: {
      pixKey: env.PIX_KEY!.trim(),
      receiverName: normalizePixText(env.PIX_RECEIVER_NAME!, 25),
      receiverCity: normalizePixText(env.PIX_RECEIVER_CITY!, 15),
    },
    inspection,
  }
}

export function getPixConfiguration(env: NodeJS.ProcessEnv = process.env): PixConfiguration | null {
  const result = resolvePixConfiguration(env)
  return result.ok ? result.config : null
}

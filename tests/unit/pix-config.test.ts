import { describe, expect, it } from 'vitest'
import { inspectPixConfiguration, resolvePixConfiguration } from '@/lib/payments/pix-config'

const valid = { PIX_KEY: '123e4567-e89b-42d3-a456-426614174000', PIX_RECEIVER_NAME: 'EntreUS', PIX_RECEIVER_CITY: 'Manaus' }

describe('manual Pix configuration', () => {
  it('recognizes a valid UUID random key without exposing it in diagnostics', () => {
    const result = resolvePixConfiguration(valid)
    expect(result.ok).toBe(true)
    expect(result.inspection).toEqual({ keyPresent: true, keyType: 'random', receiverNamePresent: true, receiverCityPresent: true, valid: true, code: null })
    expect(JSON.stringify(result.inspection)).not.toContain(valid.PIX_KEY)
  })
  it('distinguishes missing configuration from invalid fields', () => {
    expect(inspectPixConfiguration({ ...valid, PIX_KEY: '' }).code).toBe('pix_configuration_missing')
    expect(inspectPixConfiguration({ ...valid, PIX_KEY: 'not-a-key' }).code).toBe('pix_key_invalid')
    expect(inspectPixConfiguration({ ...valid, PIX_RECEIVER_NAME: '!!!' }).code).toBe('pix_receiver_invalid')
    expect(inspectPixConfiguration({ ...valid, PIX_RECEIVER_CITY: '!!!' }).code).toBe('pix_receiver_invalid')
  })
})

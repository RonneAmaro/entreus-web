import { describe, expect, it } from 'vitest'
import { crc16Ccitt, generatePixBrcode, normalizePixText, validatePixKey } from '@/lib/payments/pix-brcode'

describe('Pix BR Code', () => {
  it('matches the independent CRC16-CCITT-FALSE check vector', () => {
    expect(crc16Ccitt('123456789')).toBe('29B1')
  })
  it('generates amount, key, txid and a valid CRC', () => {
    const payload = generatePixBrcode({ pixKey: 'pix@example.com', receiverName: 'João da Silva', receiverCity: 'São Paulo', amountBrlCents: 2030, txid: 'VIP30' })
    expect(payload).toContain('pix@example.com')
    expect(payload).toContain('540520.30')
    expect(payload).toContain('VIP30')
    expect(payload.slice(-4)).toBe(crc16Ccitt(payload.slice(0, -4)))
  })
  it('normalizes receiver fields', () => expect(normalizePixText('  São   José! ', 15)).toBe('SAO JOSE'))
  it('accepts a standard UUID random Pix key', () => expect(validatePixKey('123e4567-e89b-42d3-a456-426614174000')).toBe(true))
  it.each([0, -1, Number.NaN, 10_000_000_01])('rejects invalid amount %s', (amount) => expect(() => generatePixBrcode({ pixKey: 'pix@example.com', receiverName: 'A', receiverCity: 'B', amountBrlCents: amount })).toThrow('invalid_pix_amount'))
})

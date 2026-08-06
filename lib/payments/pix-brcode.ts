const MAX_PIX_CENTS = 10_000_000_00

function field(id: string, value: string) {
  if (value.length > 99) throw new Error('pix_field_too_long')
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

export function normalizePixText(value: string, maxLength: number) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 $%*+\-./:]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function validatePixKey(value: string) {
  const key = value.trim()
  if (!key || key.length > 77) return false
  return /^[^\s]+@[^\s]+\.[^\s]+$/.test(key) || /^\+\d{10,15}$/.test(key) ||
    /^\d{11}$/.test(key) || /^\d{14}$/.test(key) || /^[0-9a-f]{32}$/i.test(key) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
}

export function crc16Ccitt(value: string) {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function generatePixBrcode(input: { pixKey: string; receiverName: string; receiverCity: string; amountBrlCents: number; txid?: string }) {
  if (!validatePixKey(input.pixKey)) throw new Error('invalid_pix_key')
  if (!Number.isSafeInteger(input.amountBrlCents) || input.amountBrlCents <= 0 || input.amountBrlCents > MAX_PIX_CENTS) throw new Error('invalid_pix_amount')
  const name = normalizePixText(input.receiverName, 25)
  const city = normalizePixText(input.receiverCity, 15)
  if (!name || !city) throw new Error('invalid_pix_receiver')
  const txid = normalizePixText(input.txid || '***', 25).replace(/[^A-Z0-9]/g, '') || '***'
  const merchantAccount = field('00', 'BR.GOV.BCB.PIX') + field('01', input.pixKey.trim())
  const withoutCrc = field('00', '01') + field('26', merchantAccount) + field('52', '0000') + field('53', '986') +
    field('54', (input.amountBrlCents / 100).toFixed(2)) + field('58', 'BR') + field('59', name) + field('60', city) +
    field('62', field('05', txid)) + '6304'
  return withoutCrc + crc16Ccitt(withoutCrc)
}

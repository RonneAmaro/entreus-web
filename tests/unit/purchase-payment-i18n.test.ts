import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { catalogs } from '@/lib/i18n'

const keys = [
  'purchase.paymentChoiceNotice', 'purchase.noAdditionalFee', 'purchase.onlyAdvertisedAmount',
  'purchase.manualConfirmation', 'purchase.automaticConfirmation', 'purchase.processingFee',
  'purchase.fullTotalNotice', 'purchase.errors.pix_configuration_missing',
  'purchase.errors.pix_key_invalid', 'purchase.errors.pix_receiver_invalid',
  'purchase.errors.pix_amount_invalid', 'purchase.errors.pix_generation_failed',
  'purchase.errors.temporary_pix_error',
] as const

describe('ItaCash payment communication', () => {
  it('provides every new payment message in every supported locale', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const key of keys) expect(catalog[key], `${locale}:${key}`).toBeTruthy()
    }
  })

  it('renders friendly fee details through i18n and structural test ids', () => {
    const source = readFileSync('app/buy-itacash/page.tsx', 'utf8')
    expect(source).toContain("t('purchase.paymentChoiceNotice')")
    expect(source).toContain("t('purchase.noAdditionalFee')")
    expect(source).toContain('purchase-manual-pix-total')
    expect(source).toContain('purchase-mercadopago-total')
    for (const text of ['Sem taxa adicional', 'Confirmação automática', 'Taxa de processamento']) {
      expect(source).not.toContain(text)
    }
  })
})

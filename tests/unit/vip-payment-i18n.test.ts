import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { catalogs } from '@/lib/i18n'

const vipPaymentKeys = [
  'vip.savePercent',
  'vip.proportionalPrice',
  'vip.perMonth',
  'vip.pixCopyPaste',
  'vip.copyPixCode',
  'vip.codeCopied',
  'vip.pixQrAlt',
  'vip.paymentChoiceNotice',
  'vip.manualPixNoFee',
  'vip.manualPixDescription',
  'vip.mercadoPagoAutomatic',
  'vip.mercadoPagoFeeDescription',
  'vip.planAmount',
  'vip.processingFee',
  'vip.totalToPay',
] as const

describe('VIP payment translations', () => {
  it('keeps runtime payment error codes visibly distinct', () => {
    const keys = [
      'vip.errors.authentication_required',
      'vip.errors.session_refresh_failed',
      'vip.errors.authentication_rejected',
      'vip.errors.payment_urls_not_configured',
      'vip.errors.payment_order_creation_failed',
      'vip.errors.payment_provider_rejected',
      'vip.errors.temporary_payment_error',
      'vip.errors.pix_configuration_missing',
      'vip.errors.pix_key_invalid',
      'vip.errors.pix_receiver_invalid',
      'vip.errors.pix_amount_invalid',
      'vip.errors.pix_generation_failed',
      'vip.errors.temporary_pix_error',
    ] as const
    for (const locale of ['pt-BR', 'en'] as const) {
      expect(new Set(keys.map((key) => catalogs[locale][key])).size).toBe(keys.length)
    }
    const source = readFileSync('app/vip-plus/page.tsx', 'utf8')
    expect(source).toContain("case 'payment_urls_not_configured': return t('vip.errors.payment_urls_not_configured')")
  })
  it('has explicit localized values in every supported locale', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const key of vipPaymentKeys) {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy()
      }
    }
    for (const locale of ['pt-BR', 'en', 'es', 'fr', 'id', 'ja', 'ko', 'zh-CN']) {
      const source = readFileSync(`lib/i18n/catalogs/${locale}.ts`, 'utf8')
      for (const key of vipPaymentKeys) expect(source, `${locale}:${key}`).toContain(`'${key}'`)
    }
  })

  it('keeps new visible VIP payment labels out of the component source', () => {
    const source = readFileSync('app/vip-plus/page.tsx', 'utf8')
    for (const hardcoded of ['Copiar código Pix', 'Código copiado', 'Economize', 'Preço proporcional', 'por mês', 'Sem taxa adicional', 'Taxa de processamento']) {
      expect(source).not.toContain(hardcoded)
    }
  })
})

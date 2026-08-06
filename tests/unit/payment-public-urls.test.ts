import { describe, expect, it } from 'vitest'
import { inspectMercadoPagoPublicUrlConfiguration, isPublicHttpsUrl, resolveMercadoPagoNotificationUrl, resolveMercadoPagoPublicUrls } from '@/lib/payments/public-urls'

describe('Mercado Pago public URLs', () => {
  it.each([
    'http://example.com', 'https://localhost:3000', 'https://app.localhost/x', 'https://server/path',
    'https://intranet', 'https://host.local', 'https://host.lan', 'https://host.internal', 'https://host.home',
    'https://host.test', 'https://host.invalid', 'https://host.example', 'https://user:pass@entreus.vercel.app', '',
  ])('rejects reserved or unsafe hostname %s', (url) => expect(isPublicHttpsUrl(url)).toBe(false))

  it.each([
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '100.127.255.255', '127.9.8.7', '169.254.1.1',
    '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.1', '192.168.1.1', '198.18.0.1',
    '198.19.255.255', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
  ])('rejects reserved IPv4 %s', (host) => expect(isPublicHttpsUrl(`https://${host}/callback`)).toBe(false))

  it.each([
    '::', '::1', 'fc00::1', 'fdff::1', 'fe80::1', 'febf::1', 'ff00::1', '2001:db8::1',
    '::ffff:10.0.0.1', '::ffff:192.168.1.1', '::ffff:c000:0201',
  ])('rejects reserved IPv6 %s', (host) => expect(isPublicHttpsUrl(`https://[${host}]/callback`)).toBe(false))

  it.each([
    'https://entreus.vercel.app',
    'https://entreus.vercel.app/api/payments/mercadopago/webhook',
    'https://8.8.8.8/callback',
    'https://[2606:4700:4700::1111]/callback',
  ])('accepts public HTTPS URL %s', (url) => expect(isPublicHttpsUrl(url)).toBe(true))
  it('prefers explicit notification and return URLs', () => {
    const env = { MERCADO_PAGO_NOTIFICATION_URL: 'https://hooks.example.com/mp', MERCADO_PAGO_RETURN_BASE_URL: 'https://return.example.com', NEXT_PUBLIC_SITE_URL: 'https://site.example.com' } as NodeJS.ProcessEnv
    expect(resolveMercadoPagoPublicUrls(env)).toEqual({ notificationUrl: 'https://hooks.example.com/mp', returnBaseUrl: 'https://return.example.com' })
  })
  it('uses both explicit public URLs even when the site URL is localhost', () => {
    const env = { MERCADO_PAGO_NOTIFICATION_URL: 'https://entreus.vercel.app/api/payments/mercadopago/webhook', MERCADO_PAGO_RETURN_BASE_URL: 'https://entreus.vercel.app', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' } as NodeJS.ProcessEnv
    expect(resolveMercadoPagoPublicUrls(env)).toEqual({ notificationUrl: env.MERCADO_PAGO_NOTIFICATION_URL, returnBaseUrl: env.MERCADO_PAGO_RETURN_BASE_URL })
    expect(inspectMercadoPagoPublicUrlConfiguration(env)).toEqual({
      notification: { present: true, source: 'explicit', protocol: 'https:', hostname: 'entreus.vercel.app', valid: true },
      returnBase: { present: true, source: 'explicit', protocol: 'https:', hostname: 'entreus.vercel.app', valid: true },
    })
  })
  it('fails independently when a specific URL is absent and the site is localhost', () => {
    expect(resolveMercadoPagoPublicUrls({ MERCADO_PAGO_NOTIFICATION_URL: 'https://entreus.vercel.app/webhook', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' } as NodeJS.ProcessEnv)).toBeNull()
    expect(resolveMercadoPagoPublicUrls({ MERCADO_PAGO_RETURN_BASE_URL: 'https://entreus.vercel.app', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' } as NodeJS.ProcessEnv)).toBeNull()
  })
  it('uses a public site only as fallback', () => expect(resolveMercadoPagoNotificationUrl({ NEXT_PUBLIC_SITE_URL: 'https://site.example.com/' } as NodeJS.ProcessEnv)).toBe('https://site.example.com/api/payments/mercadopago/webhook'))
  it('does not bypass an invalid explicit URL', () => expect(resolveMercadoPagoNotificationUrl({ MERCADO_PAGO_NOTIFICATION_URL: 'http://localhost/x', NEXT_PUBLIC_SITE_URL: 'https://site.example.com' } as NodeJS.ProcessEnv)).toBeNull())
})

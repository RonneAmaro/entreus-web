import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import { siteConfig } from '@/lib/site-config'
import { resolveLocalePreference } from '@/lib/i18n'
import { Providers } from './providers'
import { LanguageProvider } from './components/LanguageProvider'
import PWARegister from './components/PWARegister'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  manifest: '/manifest.webmanifest',
  applicationName: siteConfig.name,

  title: {
    default: `${siteConfig.name} - ${siteConfig.slogan}`,
    template: `%s | ${siteConfig.name}`,
  },

  description:
    'EntreUS e uma rede social com privacidade, liberdade, lifestyle e conexao real.',

  alternates: {
    canonical: '/',
  },

  icons: {
    icon: [
      {
        url: '/favicon-entreus.png?v=2',
        type: 'image/png',
        sizes: '653x653',
      },
    ],
    shortcut: ['/favicon-entreus.png?v=2'],
    apple: [
      {
        url: '/favicon-entreus.png?v=2',
        type: 'image/png',
        sizes: '653x653',
      },
    ],
  },

  appleWebApp: {
    capable: true,
    title: siteConfig.name,
    statusBarStyle: 'black-translucent',
  },

  openGraph: {
    title: `${siteConfig.name} - ${siteConfig.slogan}`,
    description:
      'Rede social com privacidade, liberdade, lifestyle e conexao real.',
    url: siteConfig.siteUrl,
    siteName: siteConfig.name,
    images: [
      {
        url: '/og/entreus-preview.png',
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} - ${siteConfig.slogan}`,
      },
    ],
    type: 'website',
    locale: 'pt_BR',
  },

  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} - ${siteConfig.slogan}`,
    description:
      'Rede social com privacidade, liberdade, lifestyle e conexao real.',
    images: ['/og/entreus-preview.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#134a99',
  colorScheme: 'dark light',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const cookieLocale = cookieStore.get('entreus-locale')?.value
  const locale = resolveLocalePreference({
    cookieLocale,
    acceptLanguage: headerStore.get('accept-language'),
    authenticated: false,
  })

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <Providers>
          <PWARegister />
          <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
        </Providers>
      </body>
    </html>
  )
}

import type { Metadata, Viewport } from 'next'
import { Providers } from './providers'
import { LanguageProvider } from './components/LanguageProvider'
import PWARegister from './components/PWARegister'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://entreus.vercel.app'),
  manifest: '/manifest.webmanifest',
  applicationName: 'EntreUS',

  title: {
    default: 'EntreUS — Só Entre Nós',
    template: '%s | EntreUS',
  },

  description:
    'EntreUS é uma rede social com privacidade, liberdade, lifestyle e conexão real.',

  alternates: {
    canonical: '/',
  },

  icons: {
    icon: [
      {
        url: '/favicon-entreus.png',
        type: 'image/png',
        sizes: '653x653',
      },
      {
        url: '/pwa/icons/entreus-icon-512.png',
        type: 'image/png',
        sizes: '512x512',
      },
      {
        url: '/entreus-app-icon.svg',
        type: 'image/svg+xml',
        sizes: 'any',
      },
    ],
    shortcut: '/favicon-entreus.png',
    apple: [
      {
        url: '/favicon-entreus.png',
        type: 'image/png',
        sizes: '653x653',
      },
    ],
  },

  appleWebApp: {
    capable: true,
    title: 'EntreUS',
    statusBarStyle: 'black-translucent',
  },

  openGraph: {
    title: 'EntreUS — Só Entre Nós',
    description:
      'Rede social com privacidade, liberdade, lifestyle e conexão real.',
    url: 'https://entreus.vercel.app',
    siteName: 'EntreUS',
    images: [
      {
        url: '/og/entreus-preview.png',
        width: 1200,
        height: 630,
        alt: 'EntreUS — Só Entre Nós',
      },
    ],
    type: 'website',
    locale: 'pt_BR',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'EntreUS — Só Entre Nós',
    description:
      'Rede social com privacidade, liberdade, lifestyle e conexão real.',
    images: ['/og/entreus-preview.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#134a99',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Providers>
          <PWARegister />
          <LanguageProvider>{children}</LanguageProvider>
        </Providers>
      </body>
    </html>
  )
}

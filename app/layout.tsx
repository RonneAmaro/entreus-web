import type { Metadata } from 'next'
import { Providers } from './providers'
import { LanguageProvider } from './components/LanguageProvider'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://entreus.vercel.app'),

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
      },
    ],
    shortcut: '/favicon-entreus.png',
    apple: '/favicon-entreus.png',
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Providers>
          <LanguageProvider>{children}</LanguageProvider>
        </Providers>
      </body>
    </html>
  )
}
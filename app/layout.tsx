import type { Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'EntreUS — Só Entre Nós',
    template: '%s | EntreUS',
  },
  description:
    'EntreUS é uma rede social privada focada em conexão, lifestyle, liberdade, privacidade e interações reais.',
  openGraph: {
    title: 'EntreUS — Só Entre Nós',
    description:
      'Uma rede social privada para adultos, focada em conexão, lifestyle, liberdade e privacidade.',
    siteName: 'EntreUS',
    images: [
      {
        url: '/og-image.png',
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
      'Uma rede social privada para adultos, focada em conexão, lifestyle, liberdade e privacidade.',
    images: ['/og-image.png'],
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
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
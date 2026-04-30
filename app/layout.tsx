import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EntreUS — Só Entre Nós',
  description:
    'EntreUS é uma rede social privada focada em conexão, lifestyle, liberdade e privacidade.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
  openGraph: {
    title: 'EntreUS — Só Entre Nós',
    description:
      'Uma rede social privada para adultos, focada em conexão, lifestyle, liberdade e interações reais.',
    siteName: 'EntreUS',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'EntreUS — Só Entre Nós',
      },
    ],
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
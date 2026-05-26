import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EntreUS',
    short_name: 'EntreUS',
    description:
      'Rede social EntreUS para feed, perfil, mensagens e conexoes em uma experiencia instalavel.',
    start_url: '/feed',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#134a99',
    orientation: 'portrait',
    lang: 'pt-BR',
    categories: ['social', 'entertainment', 'lifestyle'],
    icons: [
      {
        src: '/pwa/icons/entreus-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa/icons/entreus-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa/icons/entreus-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/entreus-app-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/favicon-entreus.png',
        sizes: '653x653',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    screenshots: [
      {
        src: '/pwa/entreus-home-preview.png',
        sizes: '1414x2000',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Tela inicial da EntreUS',
      },
    ],
  }
}

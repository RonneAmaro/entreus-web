import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/site-config'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
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
        src: '/favicon-entreus.png?v=2',
        sizes: '653x653',
        type: 'image/png',
        purpose: 'any',
      },
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

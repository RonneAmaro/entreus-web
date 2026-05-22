import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EntreUS — Só Entre Nós',
    short_name: 'EntreUS',
    description: 'Rede social EntreUS — Só Entre Nós',
    start_url: '/feed',
    scope: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#0ea5e9',
    orientation: 'portrait',
    lang: 'pt-BR',
    categories: ['social', 'entertainment', 'lifestyle'],
    icons: [
      // TODO: substituir por /icons/icon-192.png, /icons/icon-512.png e
      // /icons/maskable-512.png quando os ícones oficiais forem criados.
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

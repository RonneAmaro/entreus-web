const CACHE_VERSION = 'entreus-pwa-v1'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const STATIC_ASSETS = ['/offline', '/logo.png']
const SENSITIVE_PATH_PREFIXES = [
  '/api/',
  '/api/payments',
  '/api/whatsapp',
  '/api/livekit',
  '/api/r2',
  '/auth',
  '/login',
  '/signup',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(
          STATIC_ASSETS.map((asset) =>
            cache.add(new Request(asset, { cache: 'reload' }))
          )
        )
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith('entreus-pwa-'))
            .filter((cacheName) => cacheName !== STATIC_CACHE)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) return
  if (isSensitivePath(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(cacheFirstAsset(request))
  }
})

function isSensitivePath(pathname) {
  return SENSITIVE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isStaticAsset(request, url) {
  if (request.destination) {
    return ['font', 'image', 'script', 'style'].includes(request.destination)
  }

  return (
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:css|js|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/i.test(url.pathname)
  )
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request)
  } catch (error) {
    const cache = await caches.open(STATIC_CACHE)
    const offline = await cache.match('/offline')

    return (
      offline ||
      new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)

  if (cached) return cached

  const response = await fetch(request)

  if (response.ok && response.type === 'basic') {
    cache.put(request, response.clone())
  }

  return response
}

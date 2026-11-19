const CACHE_NAME = 'nori-pwa-v2'
const PRECACHE_URLS = ['/offline', '/nori-mark.svg', '/icons/icon-192.png', '/icons/icon-512.png']

const SENSITIVE_PREFIXES = [
  '/nori-api',
  '/api',
  '/admin',
  '/dashboard',
  '/account',
  '/favorites',
  '/my-bookings',
  '/checkout',
  '/login',
  '/register',
  '/reset-password',
]

function isSensitivePath(pathname) {
  return SENSITIVE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/nori-mark.svg' ||
    pathname === '/favicon.svg'
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))))
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  if (request.cache === 'no-store') return
  if (request.headers.has('authorization')) return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isSensitivePath(url.pathname)) return

  // Navigation requests: network-first, fallback to /offline when offline.
  // Never serve cached HTML for dynamic pricing/availability pages.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME)
        const offlinePage = await cache.match('/offline')
        return (
          offlinePage ||
          new Response('Bạn đang ngoại tuyến. Vui lòng kiểm tra kết nối Internet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        )
      }),
    )
    return
  }

  // Public static assets only (CSS, JS chunks, brand icons)
  // Strictly disallow caching responses with Set-Cookie or private cache-control
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request)
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === 'basic') {
              const cacheControl = response.headers.get('cache-control') || ''
              if (!response.headers.has('set-cookie') && !/no-store|private/i.test(cacheControl)) {
                cache.put(request, response.clone())
              }
            }
            return response
          })
          .catch(() => undefined)
        return cached || (await networkPromise) || new Response('', { status: 504 })
      }),
    )
  }
})

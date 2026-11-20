import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'
import { getLocalLanIPv4List, isValidIPv4 } from './scripts/lan-network.mjs'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const makePublicPreviewOrigin = (() => {
  const publicURL = process.env.FIGMA_PUBLIC_URL
  if (!publicURL) return undefined

  try {
    // Next.js expects host[:port] entries rather than full URL origins.
    return new URL(publicURL).host
  } catch {
    return undefined
  }
})()

const configuredSiteOrigins = (() => {
  const hosts = new Set<string>()
  for (const candidate of [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    ...(process.env.ALLOWED_ORIGINS?.split(',') ?? []),
  ]) {
    if (!candidate?.trim()) continue
    try {
      const parsed = new URL(candidate.trim())
      if (parsed.host) {
        hosts.add(parsed.host)
        if (parsed.hostname && parsed.hostname !== parsed.host) {
          hosts.add(parsed.hostname)
        }
      }
    } catch {
      // ignore invalid URL
    }
  }
  return Array.from(hosts)
})()

const isDevMode = process.env.NODE_ENV !== 'production'
const devPort = process.env.PORT?.trim() || '3000'
const devLanHostnames = (() => {
  if (!isDevMode) return [] as string[]
  const hosts = new Set<string>(getLocalLanIPv4List())
  const manualLanIp = process.env.NORI_LAN_IP?.trim()
  if (manualLanIp && isValidIPv4(manualLanIp) && manualLanIp !== '0.0.0.0') {
    hosts.add(manualLanIp)
  }
  for (const siteOrigin of configuredSiteOrigins) {
    hosts.add(siteOrigin)
  }
  return [...hosts]
})()

const devServerActionOrigins = devLanHostnames.flatMap((host) => [host, `${host}:${devPort}`])
const allowedDevOrigins = [
  ...new Set(
    [makePublicPreviewOrigin, ...configuredSiteOrigins, ...devLanHostnames].filter(
      (v): v is string => Boolean(v),
    ),
  ),
]
const serverActionAllowedOrigins = [
  ...new Set(
    [
      makePublicPreviewOrigin,
      ...configuredSiteOrigins,
      ...(isDevMode ? devServerActionOrigins : []),
    ].filter((v): v is string => Boolean(v)),
  ),
]

const nextConfig: NextConfig = {
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
  output: 'standalone',
  images: {
    loader: 'custom',
    loaderFile: './figma-image-loader.ts',
    qualities: [75, 80, 84],
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ...(process.env.FIGMA !== '1' ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
    ]
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  // Block local/CI/production builds on TypeScript errors while preserving
  // Figma Make cloud publish compatibility when running inside sboxd (FIGMA=1).
  typescript: {
    ignoreBuildErrors: process.env.FIGMA === '1',
  },
  // `next dev` serves the Make preview at a per-sandbox cross-origin host. Next
  // blocks its dev resources (`/_next/*`, HMR WebSocket, internal endpoints)
  // unless the origin is listed here, and a blocked HMR socket stalls Turbopack
  // so the Payload `/admin` panel renders blank in the preview iframe.
  // Dev-only - ignored by `next build`.
  //
  allowedDevOrigins,
  // Prerender source maps add ~100 MB per static build worker
  enablePrerenderSourceMaps: false,
  experimental: {
    // A single static worker keeps the managed 8 GB build within its memory budget.
    cpus: 1,
    // Payload Admin uses Next Server Actions. In the Make preview proxy, the
    // browser origin is the public sandbox host while `x-forwarded-host` points
    // at the local dev server. In LAN dev, trusted local network IPv4 hosts are
    // also allowed without enabling wildcards or relaxing production rules.
    serverActions: {
      allowedOrigins: serverActionAllowedOrigins,
    },
  },
  env: {
    NEXT_PUBLIC_SITE_URL:
      process.env.FIGMA_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    // NOTE: Do not add FIGMA_OAUTH_CLIENT_SECRET, FIGMA_CONTENT_API_ACCESS_KEY,
    // or any other credential here. Values placed in `env` are inlined into
    // the JavaScript bundle by Next.js at build time and become readable by
    // anyone who can load the app's client assets. Server-side code
    // (payload.config.ts, route handlers, server components) can still read
    // these values from `process.env.*` without declaring them here. Only
    // public, non-secret values that explicitly need to be available in
    // browser code should be added - and those should use the `NEXT_PUBLIC_*`
    // naming convention.
    FIGMA_CONTENT_API_CONTENT_SYSTEM_ID: process.env.FIGMA_CONTENT_API_CONTENT_SYSTEM_ID,
    FIGMA_CONTENT_API_URL: process.env.FIGMA_CONTENT_API_URL,
    FIGMA_OAUTH_CLIENT_ID: process.env.FIGMA_OAUTH_CLIENT_ID,
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })

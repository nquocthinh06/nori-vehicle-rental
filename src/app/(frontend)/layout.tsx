import React from 'react'
import type { Metadata, Viewport } from 'next'
import { Be_Vietnam_Pro } from 'next/font/google'
import Script from 'next/script'

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '600'],
  display: 'swap',
  preload: true,
  variable: '--font-be-vietnam',
  fallback: ['Arial', 'sans-serif'],
})
import { BodyCustomCode, renderHeadCustomCode } from '@/lib/make-custom-code'
import { makeSiteSettings, sanitizeHtmlAttribute } from '@/lib/make-site-settings'
import './styles.css'
import { AuthProvider } from '@/components/auth-provider'
import { NotificationProvider } from '@/components/booking-notification-center'
import { FavoritesProvider } from '@/components/favorites-provider'
import { ConditionalFooter } from '@/components/conditional-footer'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'
import { PwaManager } from '@/components/pwa-manager'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { getSiteContent } from '@/lib/catalogue'
import { ExternalLink } from '@/components/ui'

const defaultTitle = 'NORI — Thuê xe linh hoạt. Mua xe tự tin.'
const title = makeSiteSettings.title ?? defaultTitle
const description =
  makeSiteSettings.description ??
  'Thuê ô tô, xe máy và bán tải. Cùng NORI tận hưởng hành trình theo cách của bạn.'
const favicon = makeSiteSettings.icons?.icon ?? '/nori-mark.svg'
const socialImage = makeSiteSettings.openGraph?.image
const googleAnalyticsId = sanitizeHtmlAttribute(makeSiteSettings.analytics?.googleAnalyticsId)

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#087568',
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title,
  description,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NORI',
  },
  robots: makeSiteSettings.robots?.index === false ? { follow: false, index: false } : undefined,
  icons: favicon
    ? {
        icon: favicon,
        apple: '/icons/apple-touch-icon.png',
      }
    : {
        apple: '/icons/apple-touch-icon.png',
      },
  openGraph: {
    title,
    description,
    images: socialImage ? [socialImage] : undefined,
  },
  twitter: socialImage
    ? {
        card: 'summary_large_image',
        images: [socialImage],
      }
    : undefined,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const language = sanitizeHtmlAttribute(makeSiteSettings.language) || 'vi'
  const customScripts = makeSiteSettings.customScripts
  const site = await getSiteContent()

  // Browser security/scanner extensions (e.g. Kaspersky Protection, Bisect) inject
  // dynamic `__processed_<uuid>__` attributes directly onto <html> / <body> before
  // React hydration. Targeted suppressHydrationWarning on root html/body prevents
  // false-positive attribute warnings on outer document tags without masking any
  // real SSR/CSR mismatches inside React application components.
  return (
    <html
      lang={language}
      data-scroll-behavior="smooth"
      className={beVietnamPro.variable}
      suppressHydrationWarning
    >
      <head>
        {renderHeadCustomCode(customScripts?.headStart, 'head-start')}
        {renderHeadCustomCode(customScripts?.headEnd, 'head-end')}
      </head>
      <body className="min-h-screen bg-canvas text-ink antialiased" suppressHydrationWarning>
        <BodyCustomCode html={customScripts?.bodyStart} />
        <ExternalLink className="figma-bypass-link" href="#main-content">
          Bỏ qua điều hướng, đến nội dung
        </ExternalLink>
        <div id="root" tabIndex={-1}>
          <AuthProvider>
            <NotificationProvider>
              <FavoritesProvider>
                <PwaManager />
                {site.maintenanceBannerEnabled && site.maintenanceBannerText && (
                  <div
                    role="status"
                    className="bg-warning-soft px-4 py-2 text-center text-caption font-medium text-warning"
                  >
                    {site.maintenanceBannerText}
                  </div>
                )}
                <SiteHeader />
                {children}
                <ConditionalFooter>
                  <SiteFooter site={site} />
                </ConditionalFooter>
                <MobileBottomNav />
              </FavoritesProvider>
            </NotificationProvider>
          </AuthProvider>
        </div>
        {googleAnalyticsId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
              strategy="afterInteractive"
            />
            <Script id="figma-google-analytics" strategy="afterInteractive">
              {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(googleAnalyticsId)});
`}
            </Script>
          </>
        )}
        <BodyCustomCode html={customScripts?.bodyEnd} />
      </body>
    </html>
  )
}

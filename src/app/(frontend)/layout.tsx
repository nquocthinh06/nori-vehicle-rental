import React from 'react'
import type { Metadata } from 'next'
import Script from 'next/script'
import { BodyCustomCode, renderHeadCustomCode } from '@/lib/make-custom-code'
import { makeSiteSettings, sanitizeHtmlAttribute } from '@/lib/make-site-settings'
import './styles.css'
import { AuthProvider } from '@/components/auth-provider'
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title,
  description,
  robots: makeSiteSettings.robots?.index === false ? { follow: false, index: false } : undefined,
  icons: favicon ? { icon: favicon } : undefined,
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

  return (
    <html lang={language} data-scroll-behavior="smooth">
      <head>
        {renderHeadCustomCode(customScripts?.headStart, 'head-start')}
        {renderHeadCustomCode(customScripts?.headEnd, 'head-end')}
      </head>
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <BodyCustomCode html={customScripts?.bodyStart} />
        <ExternalLink className="figma-bypass-link" href="#main-content">
          Bỏ qua điều hướng, đến nội dung
        </ExternalLink>
        <div id="root" tabIndex={-1}>
          <AuthProvider>
            <SiteHeader />
            {children}
            <SiteFooter site={site} />
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

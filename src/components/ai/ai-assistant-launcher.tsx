'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/icon'

const LazyAIChatPanel = dynamic(() => import('./ai-chat-panel').then((mod) => mod.AIChatPanel), {
  ssr: false,
})

/**
 * Lightweight floating trigger for NORI AI Assistant.
 * - Lazy-loads the full chat panel ONLY when opened (zero initial bundle overhead).
 * - Automatically avoids colliding with MobileBottomNav, VehicleDetail Sticky Booking Bar,
 *   Checkout CTA, and hides completely on Admin Dashboard / Payload Admin / Offline pages.
 */
export function AIAssistantLauncher() {
  const pathname = usePathname() ?? '/'
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/offline')
  ) {
    return null
  }

  const isVehicleDetail = /^\/vehicles\/[^/]+/.test(pathname)
  const isCheckout = pathname.startsWith('/checkout')

  // Position cleanly above mobile bottom bars without overlapping navigation or CTA
  const positionClass = isCheckout
    ? 'hidden lg:inline-flex lg:bottom-6 lg:right-6'
    : isVehicleDetail
      ? 'inline-flex bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 lg:bottom-6 lg:right-6'
      : 'inline-flex bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 lg:bottom-6 lg:right-6'

  return (
    <>
      {!open && (
        <button
          ref={triggerRef}
          type="button"
          data-testid="nori-ai-launcher"
          aria-label="Mở Trợ lý AI NORI"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={`fixed z-40 min-h-touch items-center gap-2 rounded-pill bg-brand px-4 py-2.5 text-small font-semibold text-inverse shadow-float transition-colors hover:bg-brand-hover focus-visible:outline-offset-4 active:translate-y-px ${positionClass}`}
        >
          <Icon name="sparkles" className="size-4 shrink-0" />
          <span>Trợ lý AI</span>
        </button>
      )}

      {open && (
        <LazyAIChatPanel
          onClose={() => {
            setOpen(false)
            window.requestAnimationFrame(() => triggerRef.current?.focus())
          }}
        />
      )}
    </>
  )
}

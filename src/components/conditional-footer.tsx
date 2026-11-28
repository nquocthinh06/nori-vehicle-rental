'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export function ConditionalMaintenanceBanner({ text }: { text: string }) {
  const pathname = usePathname()
  if (pathname?.startsWith('/dashboard')) return null
  return (
    <div
      role="status"
      className="bg-warning-soft px-4 py-2 text-center text-caption font-medium text-warning"
    >
      {text}
    </div>
  )
}

export function ConditionalFooter({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname?.startsWith('/dashboard')) return null
  const hasBottomNav =
    !pathname?.startsWith('/checkout') && !/^\/vehicles\/[^/]+/.test(pathname ?? '')
  return <div className={hasBottomNav ? 'pb-16 lg:pb-0' : undefined}>{children}</div>
}

'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export function ConditionalFooter({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname?.startsWith('/dashboard')) return null
  const hasBottomNav =
    !pathname?.startsWith('/checkout') && !/^\/vehicles\/[^/]+/.test(pathname ?? '')
  return <div className={hasBottomNav ? 'pb-16 lg:pb-0' : undefined}>{children}</div>
}

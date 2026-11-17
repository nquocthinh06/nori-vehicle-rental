import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminShell } from '@/components/admin/admin-shell'
import { ToastProvider } from '@/components/admin/toast'

export const metadata: Metadata = {
  title: 'NORI Administration | Quản trị vận hành',
  robots: { index: false, follow: false },
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AdminShell>{children}</AdminShell>
    </ToastProvider>
  )
}

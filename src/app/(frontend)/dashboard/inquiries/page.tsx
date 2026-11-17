import { Suspense } from 'react'
import { InquiriesPanel } from '@/components/admin/inquiries-panel'

export default function DashboardInquiriesPage() {
  return (
    <Suspense fallback={null}>
      <InquiriesPanel />
    </Suspense>
  )
}

import { Suspense } from 'react'
import { BookingsPanel } from '@/components/admin/bookings-panel'

export default function DashboardBookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsPanel />
    </Suspense>
  )
}

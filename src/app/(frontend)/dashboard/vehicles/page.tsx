import { Suspense } from 'react'
import { VehiclesPanel } from '@/components/admin/vehicles-panel'

export default function DashboardVehiclesPage() {
  return (
    <Suspense fallback={null}>
      <VehiclesPanel />
    </Suspense>
  )
}

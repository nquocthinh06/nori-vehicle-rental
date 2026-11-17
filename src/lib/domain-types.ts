import type { Photo } from './catalogue'

export type FleetView = {
  id: string
  reference: string
  modelId: string
  modelName: string
  modelSlug: string
  intent: 'RENT' | 'SALE' | 'BOTH'
  pricePerDay: number | null
  salePrice: number | null
  odometer: number | null
  condition: string | null
  inspectedAt: string | null
  color: string | null
  version: string | null
  photos: { image: Photo; caption: string | null; kind: string | null }[]
}
export type Quote = {
  available: boolean
  totalDays: number
  dailyPrice: number
  estimatedTotal: number
  startDate: string
  endDate: string
}
export type BookingView = {
  id: string
  bookingKey: string
  status: string
  modelName: string
  reference: string
  startDate: string
  endDate: string
  totalDays: number
  totalPrice: number
  dailyPriceSnapshot: number
  createdAt: string
  customerName?: string
}

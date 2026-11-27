import { fordAdapter } from './ford.ts'
import { genericAdapter } from './generic.ts'
import { hondaAdapter } from './honda.ts'
import { hyundaiAdapter } from './hyundai.ts'
import { kawasakiAdapter } from './kawasaki.ts'
import { mazdaAdapter } from './mazda.ts'
import { mercedesBenzAdapter } from './mercedes-benz.ts'
import { mitsubishiAdapter } from './mitsubishi.ts'
import { toyotaAdapter } from './toyota.ts'
import type { ManufacturerAdapter } from './types.ts'
import { vinfastAdapter } from './vinfast.ts'
import { yamahaAdapter } from './yamaha.ts'

export const MANUFACTURER_ADAPTERS: readonly ManufacturerAdapter[] = [
  toyotaAdapter,
  hondaAdapter,
  fordAdapter,
  mitsubishiAdapter,
  mazdaAdapter,
  hyundaiAdapter,
  mercedesBenzAdapter,
  vinfastAdapter,
  yamahaAdapter,
  kawasakiAdapter,
]

export function resolveAdapterForUrl(rawUrl: string): ManufacturerAdapter {
  try {
    const parsed = new URL(rawUrl)
    return MANUFACTURER_ADAPTERS.find((a) => a.supportsUrl(parsed)) ?? genericAdapter
  } catch {
    return genericAdapter
  }
}

export function resolveAdapterByBrand(brand: string | null | undefined): ManufacturerAdapter {
  const norm = (brand ?? '').trim().toLowerCase()
  if (!norm) return genericAdapter
  return (
    MANUFACTURER_ADAPTERS.find(
      (a) => a.id === norm || a.brand.toLowerCase() === norm || norm.includes(a.id),
    ) ?? genericAdapter
  )
}

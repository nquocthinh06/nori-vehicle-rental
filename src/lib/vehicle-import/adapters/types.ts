import type { ExtractedVehicleRaw, VehicleCategory } from '../types.ts'
import type { HtmlExtractionResult } from '../extractor.ts'

export type ManufacturerAdapter = {
  id: string
  brand: string
  domains: readonly string[]
  defaultCategory?: VehicleCategory
  supportsUrl: (url: URL) => boolean
  extract: (params: {
    url: string
    html: string
    signals: HtmlExtractionResult
    base: Partial<ExtractedVehicleRaw>
  }) => ExtractedVehicleRaw
}

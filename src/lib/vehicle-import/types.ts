export type ImportMethod = 'URL' | 'AI_SEARCH' | 'BULK' | 'PDF_BROCHURE' | 'MANUAL'

export type ImportJobStatus =
  | 'QUEUED'
  | 'FETCHING'
  | 'EXTRACTING'
  | 'NORMALIZING'
  | 'VALIDATING'
  | 'PREVIEW_READY'
  | 'AWAITING_APPROVAL'
  | 'IMPORTING'
  | 'COMPLETED'
  | 'PARTIAL_SUCCESS'
  | 'FAILED'
  | 'CANCELLED'

export type ConflictPolicy = 'SKIP_EXISTING' | 'MERGE_EMPTY' | 'OVERWRITE_UNLOCKED'

export type ImportDataGroup =
  | 'banner'
  | 'overview'
  | 'exterior'
  | 'interior'
  | 'technology'
  | 'specs'
  | 'variants'
  | 'colors'
  | 'description'
  | 'source'

export type VehicleCategory = 'CAR' | 'MOTORBIKE' | 'PICKUP'
export type GalleryKind = 'OVERVIEW' | 'EXTERIOR' | 'INTERIOR' | 'ENGINE' | 'FEATURE'
export type SpecGroup =
  | 'OVERVIEW'
  | 'ENGINE'
  | 'DIMENSIONS'
  | 'CHASSIS'
  | 'PICKUP'
  | 'MOTORBIKE'
  | 'EV'
export type FeatureCategory = 'COMFORT' | 'SAFETY' | 'DRIVER_ASSIST' | 'TECHNOLOGY'
export type FeatureStatus = 'EQUIPPED' | 'NOT_EQUIPPED' | 'UNVERIFIED' | 'NOT_APPLICABLE'
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

export type ExtractedMediaCandidate = {
  url: string
  kind: GalleryKind
  photoType?: string
  altText?: string
  caption?: string
  variantName?: string
  colorName?: string
  license?: string
  sourceUrl?: string
  sourceName?: string
  width?: number
  height?: number
  selected?: boolean
}

export type ExtractedSpecItem = {
  group: SpecGroup
  label: string
  value: string
  variantName?: string
  source?: string
  confidence: ConfidenceLevel
  pageRef?: number
  evidenceSnippet?: string
}

export type ExtractedFeatureItem = {
  name: string
  category: FeatureCategory
  status: FeatureStatus
  variantNote?: string
}

export type ExtractedVariantColor = {
  name: string
  hex?: string
  sourceUrl?: string
  imageUrl?: string
}

export type ExtractedVariantItem = {
  name: string
  year?: number
  listedPrice?: number
  msrpReferenceVnd?: number
  fuelType?: string
  transmission?: string
  driveType?: string
  seats?: number
  summary?: string
  colors: ExtractedVariantColor[]
}

export type UncertaintyFlag = {
  field: string
  reason: string
  severity: 'WARN' | 'REVIEW'
  pageRef?: number
  snippet?: string
}

export type ExtractedVehicleRaw = {
  brand?: string
  name?: string
  officialName?: string
  modelLine?: string
  versionName?: string
  generation?: string
  category?: VehicleCategory
  subCategory?: string
  bodyStyle?: string
  segment?: string
  origin?: string
  modelYear?: number
  market?: string
  seats?: number
  fuelType?: string
  transmission?: string
  driveType?: string
  listedPrice?: number
  msrpReferenceVnd?: number
  suitableFor?: string
  usagePurpose?: string
  shortDescription?: string
  description?: string
  exteriorOverview?: string
  interiorOverview?: string
  engineOverview?: string
  highlights?: string[]
  features?: ExtractedFeatureItem[]
  specifications?: ExtractedSpecItem[]
  variants?: ExtractedVariantItem[]
  mediaCandidates?: ExtractedMediaCandidate[]
  sourceUrl?: string
  sourceLabel?: string
  sourceType?: 'OFFICIAL_URL' | 'PDF_BROCHURE' | 'AI_ASSISTED' | 'BULK_FILE' | 'MANUAL'
  warnings?: string[]
  uncertaintyFlags?: UncertaintyFlag[]
  adapterId?: string
}

export type NormalizedVehicleDraft = {
  name: string
  officialName: string | null
  slug: string
  brand: string
  modelLine: string | null
  versionName: string | null
  generation: string | null
  category: VehicleCategory
  subCategory: string | null
  bodyStyle: string | null
  segment: string | null
  origin: string | null
  modelYear: number | null
  market: string
  seats: number | null
  fuelType: 'Xăng' | 'Dầu (Diesel)' | 'Điện (EV)' | 'Hybrid' | null
  transmission: string | null
  driveType: string | null
  listedPrice: number | null
  msrpReferenceVnd: number | null
  suitableFor: string | null
  usagePurpose: string | null
  shortDescription: string | null
  description: string | null
  exteriorOverview: string | null
  interiorOverview: string | null
  engineOverview: string | null
  highlights: { text: string }[]
  features: ExtractedFeatureItem[]
  specifications: ExtractedSpecItem[]
  variants: ExtractedVariantItem[]
  mediaCandidates: ExtractedMediaCandidate[]
  source: string
  importSourceUrl: string | null
  importSourceType: 'OFFICIAL_URL' | 'PDF_BROCHURE' | 'AI_ASSISTED' | 'BULK_FILE' | 'MANUAL'
  importSourceHash: string
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'DRAFT'
  warnings: string[]
  uncertaintyFlags: UncertaintyFlag[]
}

export type FieldDiffItem = {
  field: string
  label: string
  currentValue: unknown
  proposedValue: unknown
  changed: boolean
  locked: boolean
  selected: boolean
  source: string
  confidence: ConfidenceLevel
}

export type ExistingModelMatch = {
  id: string
  slug: string
  name: string
  brand: string
  verificationStatus: string
  visible: boolean
  revisionNumber: number
  lockedFields: string[]
  lastImportedAt: string | null
}

export type MediaImportReportItem = {
  url: string
  status: 'UPLOADED' | 'DEDUPLICATED' | 'SKIPPED' | 'FAILED'
  mediaId?: string
  filename?: string
  sha256?: string
  kind?: GalleryKind
  reason?: string
}

export type BulkItemPreview = {
  index: number
  input: string
  inputType: 'URL' | 'MODEL_NAME' | 'CSV_ROW' | 'JSON_RECORD'
  status: 'PREVIEW_READY' | 'FAILED' | 'SKIPPED'
  brand?: string
  modelName?: string
  slug?: string
  draft?: NormalizedVehicleDraft
  diff?: FieldDiffItem[]
  existingModelMatch?: ExistingModelMatch | null
  uncertaintyFlags?: UncertaintyFlag[]
  errorCode?: string
  errorMessage?: string
}

'use client'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  featureStatusLabels,
  formatMoney,
  getDynamicFeaturePresets,
  getDynamicSpecTemplates,
  getPhotoTypeOptions,
  isSpecApplicable,
  operationStatusLabels,
  subCategoriesByCategory,
  subCategoryLabels,
} from '@/lib/rental-rules'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Heading,
  Input,
  NoriLink,
  Notice,
  Select,
  Skeleton,
  TabButton,
  Text,
  Textarea,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import type {
  ExtractedDraftPreview,
  SmartImportMode,
  SmartImportTargetModel,
} from './smart-import-drawer'
import { useToast } from './toast'

const SmartImportDrawer = dynamic(
  () => import('./smart-import-drawer').then((m) => m.SmartImportDrawer),
  { ssr: false },
)

type GalleryFormItem = {
  imageId: string
  image: { url: string; alt: string }
  kind: 'OVERVIEW' | 'EXTERIOR' | 'INTERIOR' | 'ENGINE' | 'FEATURE'
  photoType: string
  isPrimary: boolean
  sortOrder: number
  altText: string
  caption: string
  variantName: string
  colorName: string
  sourceUrl: string
  license: string
  verified: boolean
}

type SpecFormItem = {
  group: 'OVERVIEW' | 'ENGINE' | 'DIMENSIONS' | 'CHASSIS' | 'PICKUP' | 'MOTORBIKE' | 'EV'
  label: string
  value: string
  variantName: string
  source: string
}

type FeatureFormItem = {
  name: string
  category: 'COMFORT' | 'SAFETY' | 'DRIVER_ASSIST' | 'TECHNOLOGY'
  status: 'EQUIPPED' | 'NOT_EQUIPPED' | 'UNVERIFIED' | 'NOT_APPLICABLE'
  variantNote: string
}

type VariantColorFormItem = {
  name: string
  hex: string
  sourceUrl: string
  imageId: string | null
  image: { url: string; alt: string } | null
}

type VariantFormItem = {
  name: string
  year: number | null
  listedPrice: number | null
  referenceRentPrice: number | null
  fuelType: string
  transmission: string
  driveType: string
  seats: number | null
  summary: string
  colors: VariantColorFormItem[]
}

type LinkedVehicleSummary = {
  id: string
  reference: string
  version: string | null
  color: string | null
  odometer: number | null
  pricePerDay: number | null
  salePrice: number | null
  operationStatus: string
  status: string
  isDemo: boolean
}

type ModelRow = {
  id: string
  name: string
  officialName: string
  modelLine: string
  versionName: string
  generation: string
  slug: string
  brand: string
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP'
  subCategory: string | null
  bodyStyle: string
  segment: string | null
  origin: string | null
  modelYear: number | null
  seats: number | null
  fuelType: string | null
  transmission: string | null
  driveType: string | null
  listedPrice: number | null
  referenceRentPrice: number | null
  defaultDepositSuggestion: number | null
  suitableFor: string
  usagePurpose: string
  shortDescription: string
  description: string | null
  exteriorOverview: string
  interiorOverview: string
  engineOverview: string
  highlights: string[]
  features: FeatureFormItem[]
  gallery: GalleryFormItem[]
  specifications: SpecFormItem[]
  variants: VariantFormItem[]
  source: string | null
  importSourceUrl?: string | null
  importSourceType?: string | null
  lastImportedAt?: string | null
  lockedFields?: string[]
  revisionNumber?: number
  verificationStatus: string
  visible: boolean
  featured: boolean
  sortOrder: number
  updatedAt?: string
  cover: { url: string; alt: string } | null
  coverId: string | null
  specsCount: number
  featuresCount: number
  variantsCount: number
  galleryCount: number
  fleetCount: number
  linkedVehicles: LinkedVehicleSummary[]
}

type EditorTab =
  | 'overview'
  | 'media'
  | 'specs'
  | 'tech'
  | 'safety'
  | 'variants'
  | 'pricing'
  | 'fleet'
  | 'sources'
  | 'preview'

const catLabels: Record<string, string> = {
  CAR: 'Ô tô',
  MOTORBIKE: 'Xe máy',
  PICKUP: 'Bán tải',
}

const EDITOR_TABS: { key: EditorTab; label: string }[] = [
  { key: 'overview', label: '1. Tổng quan' },
  { key: 'media', label: '2. Hình ảnh & Media' },
  { key: 'specs', label: '3. Thông số kỹ thuật' },
  { key: 'tech', label: '4. Công nghệ & Tiện nghi' },
  { key: 'safety', label: '5. An toàn' },
  { key: 'variants', label: '6. Phiên bản & Màu sắc' },
  { key: 'pricing', label: '7. Giá & Chính sách' },
  { key: 'fleet', label: '8. Xe thực tế' },
  { key: 'sources', label: '9. Nguồn tham chiếu' },
  { key: 'preview', label: '10. Xem trước' },
]

export function ModelsPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<ModelRow[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [subCategoryFilter, setSubCategoryFilter] = useState('')
  const [verificationFilter, setVerificationFilter] = useState('')
  const [visibleFilter, setVisibleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  // Smart Import Drawer state (lazy-loaded)
  const [importDrawerOpen, setImportDrawerOpen] = useState(false)
  const [importDrawerMode, setImportDrawerMode] = useState<SmartImportMode>('URL')
  const [importTargetModel, setImportTargetModel] = useState<SmartImportTargetModel | null>(null)

  // Editor workspace state
  const [editorMode, setEditorMode] = useState<'list' | 'edit'>('list')
  const [activeTab, setActiveTab] = useState<EditorTab>('overview')
  const [editing, setEditing] = useState<ModelRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ModelRow | null>(null)
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgressText, setUploadProgressText] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Form fields (preserved across all 10 tabs)
  const [name, setName] = useState('')
  const [officialName, setOfficialName] = useState('')
  const [modelLine, setModelLine] = useState('')
  const [versionName, setVersionName] = useState('')
  const [generation, setGeneration] = useState('')
  const [brand, setBrand] = useState('')
  const [catField, setCatField] = useState<'CAR' | 'MOTORBIKE' | 'PICKUP'>('CAR')
  const [subCategory, setSubCategory] = useState('')
  const [bodyStyle, setBodyStyle] = useState('')
  const [segment, setSegment] = useState('')
  const [origin, setOrigin] = useState('')
  const [modelYear, setModelYear] = useState('')
  const [seats, setSeats] = useState('')
  const [fuelType, setFuelType] = useState('')
  const [transmission, setTransmission] = useState('')
  const [driveType, setDriveType] = useState('')
  const [listedPrice, setListedPrice] = useState('')
  const [referenceRentPrice, setReferenceRentPrice] = useState('')
  const [defaultDepositSuggestion, setDefaultDepositSuggestion] = useState('')
  const [suitableFor, setSuitableFor] = useState('')
  const [usagePurpose, setUsagePurpose] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')
  const [exteriorOverview, setExteriorOverview] = useState('')
  const [interiorOverview, setInteriorOverview] = useState('')
  const [engineOverview, setEngineOverview] = useState('')
  const [highlights, setHighlights] = useState<string[]>([])
  const [newHighlight, setNewHighlight] = useState('')
  const [features, setFeatures] = useState<FeatureFormItem[]>([])
  const [customFeatureName, setCustomFeatureName] = useState('')
  const [customSafetyName, setCustomSafetyName] = useState('')
  const [gallery, setGallery] = useState<GalleryFormItem[]>([])
  const [coverId, setCoverId] = useState<string | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [specifications, setSpecifications] = useState<SpecFormItem[]>([])
  const [variants, setVariants] = useState<VariantFormItem[]>([])
  const [source, setSource] = useState('')
  const [verificationStatus, setVerificationStatus] = useState('VERIFIED')
  const [visible, setVisible] = useState(true)
  const [featured, setFeatured] = useState(false)
  const [sortOrder, setSortOrder] = useState('0')

  // Warn before browser tab unload when unsaved changes exist
  useEffect(() => {
    if (editorMode !== 'edit' || !isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [editorMode, isDirty])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams({
      view: 'models',
      page: String(page),
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(category ? { category } : {}),
      ...(brandFilter ? { brand: brandFilter } : {}),
      ...(subCategoryFilter ? { subCategory: subCategoryFilter } : {}),
      ...(verificationFilter ? { verificationStatus: verificationFilter } : {}),
      ...(visibleFilter ? { visible: visibleFilter } : {}),
    })
    api<{ items: ModelRow[]; totalDocs: number; totalPages: number }>(
      `/dashboard/vehicles?${sp.toString()}`,
    )
      .then((res) => {
        if (!active) return
        setItems(res.items)
        setTotalDocs(res.totalDocs)
        setTotalPages(res.totalPages)
      })
      .catch((e) => {
        if (active) setError((e as Error).message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [page, q, category, brandFilter, subCategoryFilter, verificationFilter, visibleFilter, retry])

  const brandFilterOptions = useMemo(() => {
    const known = [
      'Toyota',
      'Honda',
      'Ford',
      'Mitsubishi',
      'Mazda',
      'Hyundai',
      'Mercedes-Benz',
      'VinFast',
      'Yamaha',
      'Kawasaki',
    ]
    return [...new Set([...known, ...items.map((m) => m.brand).filter(Boolean)])].sort((a, b) =>
      a.localeCompare(b, 'vi'),
    )
  }, [items])

  const subCategoryFilterOptions = useMemo(() => {
    if (category && category in subCategoriesByCategory) {
      return subCategoriesByCategory[category as 'CAR' | 'MOTORBIKE' | 'PICKUP'] ?? []
    }
    return Object.keys(subCategoryLabels)
  }, [category])

  function openImportDrawer(mode: SmartImportMode, model?: ModelRow | null) {
    setImportDrawerMode(mode)
    setImportTargetModel(
      model
        ? {
            id: model.id,
            name: model.name,
            brand: model.brand,
            slug: model.slug,
            source: model.importSourceUrl || model.source,
            modelYear: model.modelYear,
            lockedFields: model.lockedFields ?? [],
            verificationStatus: model.verificationStatus,
          }
        : null,
    )
    setImportDrawerOpen(true)
  }

  function openFromImportDraft(draft?: ExtractedDraftPreview | null) {
    if (!draft) {
      openCreate()
      return
    }
    openCreate()
    if (draft.name) setName(draft.name)
    if (draft.officialName) setOfficialName(draft.officialName)
    if (draft.brand) setBrand(draft.brand)
    if (draft.category) setCatField(draft.category)
    if (draft.subCategory) setSubCategory(draft.subCategory)
    if (draft.modelYear) setModelYear(String(draft.modelYear))
    if (draft.versionName) setVersionName(draft.versionName)
    if (draft.seats) setSeats(String(draft.seats))
    if (draft.fuelType) setFuelType(draft.fuelType)
    if (draft.transmission) setTransmission(draft.transmission)
    if (draft.driveType) setDriveType(draft.driveType)
    if (draft.listedPrice) setListedPrice(String(draft.listedPrice))
    if (draft.shortDescription) setShortDescription(draft.shortDescription)
    if (draft.description) setDescription(draft.description)
    if (draft.exteriorOverview) setExteriorOverview(draft.exteriorOverview)
    if (draft.interiorOverview) setInteriorOverview(draft.interiorOverview)
    if (draft.engineOverview) setEngineOverview(draft.engineOverview)
    if (draft.highlights?.length) setHighlights(draft.highlights)
    if (draft.specifications?.length) {
      setSpecifications(
        draft.specifications.map((s) => ({
          group: (s.group as SpecFormItem['group']) || 'OVERVIEW',
          label: s.label,
          value: s.value,
          variantName: s.variantName ?? '',
          source: s.source ?? '',
        })),
      )
    }
    if (draft.sourceUrl || draft.source) setSource(draft.sourceUrl || draft.source || '')
    setIsDirty(true)
  }

  function markChanged() {
    setIsDirty(true)
  }

  function openCreate() {
    setEditing(null)
    setActiveTab('overview')
    setName('')
    setOfficialName('')
    setModelLine('')
    setVersionName('')
    setGeneration('')
    setBrand('')
    setCatField('CAR')
    setSubCategory('SUV')
    setBodyStyle('')
    setSegment('')
    setOrigin('')
    setModelYear('')
    setSeats('5')
    setFuelType('Xăng')
    setTransmission('')
    setDriveType('')
    setListedPrice('')
    setReferenceRentPrice('')
    setDefaultDepositSuggestion('')
    setSuitableFor('')
    setUsagePurpose('')
    setShortDescription('')
    setDescription('')
    setExteriorOverview('')
    setInteriorOverview('')
    setEngineOverview('')
    setHighlights([])
    setFeatures([])
    setGallery([])
    setCoverId(null)
    setCoverPreview(null)
    setSpecifications([])
    setVariants([])
    setSource('')
    setVerificationStatus('VERIFIED')
    setVisible(true)
    setFeatured(false)
    setSortOrder('0')
    setFormError('')
    setFieldErrors({})
    setIsDirty(false)
    setEditorMode('edit')
  }

  function openEdit(m: ModelRow) {
    setEditing(m)
    setActiveTab('overview')
    setName(m.name)
    setOfficialName(m.officialName ?? '')
    setModelLine(m.modelLine ?? '')
    setVersionName(m.versionName ?? '')
    setGeneration(m.generation ?? '')
    setBrand(m.brand)
    setCatField(m.category)
    const allowedSubs = subCategoriesByCategory[m.category] ?? []
    setSubCategory(m.subCategory && allowedSubs.includes(m.subCategory) ? m.subCategory : '')
    setBodyStyle(m.bodyStyle ?? '')
    setSegment(m.segment ?? '')
    setOrigin(m.origin ?? '')
    setModelYear(m.modelYear != null ? String(m.modelYear) : '')
    setSeats(m.seats != null ? String(m.seats) : '')
    setFuelType(m.fuelType ?? '')
    setTransmission(m.transmission ?? '')
    setDriveType(m.driveType ?? '')
    setListedPrice(m.listedPrice != null ? String(m.listedPrice) : '')
    setReferenceRentPrice(m.referenceRentPrice != null ? String(m.referenceRentPrice) : '')
    setDefaultDepositSuggestion(
      m.defaultDepositSuggestion != null ? String(m.defaultDepositSuggestion) : '',
    )
    setSuitableFor(m.suitableFor ?? '')
    setUsagePurpose(m.usagePurpose ?? '')
    setShortDescription(m.shortDescription ?? '')
    setDescription(m.description ?? '')
    setExteriorOverview(m.exteriorOverview ?? '')
    setInteriorOverview(m.interiorOverview ?? '')
    setEngineOverview(m.engineOverview ?? '')
    setHighlights([...(m.highlights ?? [])])
    setFeatures((m.features ?? []).map((f) => ({ ...f })))
    setGallery((m.gallery ?? []).map((g) => ({ ...g })))
    setCoverId(m.coverId)
    setCoverPreview(m.cover?.url ?? null)
    setSpecifications((m.specifications ?? []).map((s) => ({ ...s })))
    setVariants(
      (m.variants ?? []).map((v) => ({
        ...v,
        colors: (v.colors ?? []).map((c) => ({ ...c })),
      })),
    )
    setSource(m.source ?? '')
    setVerificationStatus(m.verificationStatus || 'VERIFIED')
    setVisible(m.visible)
    setFeatured(m.featured)
    setSortOrder(String(m.sortOrder ?? 0))
    setFormError('')
    setFieldErrors({})
    setIsDirty(false)
    setEditorMode('edit')
  }

  function requestCloseEditor() {
    if (isDirty) {
      setConfirmDiscardOpen(true)
    } else {
      setEditorMode('list')
    }
  }

  const allowedSubCategories = useMemo(() => subCategoriesByCategory[catField] ?? [], [catField])
  const isElectricModel = fuelType === 'Điện (EV)'
  const photoTypeOptions = useMemo(
    () => getPhotoTypeOptions(catField, isElectricModel, false),
    [catField, isElectricModel],
  )
  const specTemplates = useMemo(
    () => getDynamicSpecTemplates(catField, fuelType),
    [catField, fuelType],
  )
  const featurePresets = useMemo(() => getDynamicFeaturePresets(catField), [catField])

  // Data completeness meter
  const completeness = useMemo(() => {
    const checks = [
      { ok: Boolean(name.trim() && brand.trim()), label: 'Tên xe & Thương hiệu' },
      { ok: Boolean(subCategory), label: 'Phân loại kiểu dáng' },
      { ok: Boolean(seats.trim() && fuelType), label: 'Số chỗ & Năng lượng' },
      { ok: Boolean(description.trim()), label: 'Mô tả tổng quan' },
      { ok: Boolean(coverId || gallery.length > 0), label: 'Ảnh đại diện' },
      { ok: gallery.length >= 2, label: 'Bộ ảnh Gallery (≥2 góc chụp)' },
      { ok: specifications.length >= 5, label: 'Thông số kỹ thuật (≥5 mục)' },
      { ok: features.length >= 3, label: 'Trang bị & An toàn (≥3 mục)' },
      { ok: variants.length >= 1, label: 'Phiên bản & Màu sắc' },
      { ok: Boolean(source.trim()), label: 'Nguồn tham chiếu' },
    ]
    const done = checks.filter((c) => c.ok).length
    const missing = checks.filter((c) => !c.ok).map((c) => c.label)
    return {
      percent: Math.round((done / checks.length) * 100),
      missing,
    }
  }, [
    name,
    brand,
    subCategory,
    seats,
    fuelType,
    description,
    coverId,
    gallery.length,
    specifications.length,
    features.length,
    variants.length,
    source,
  ])

  async function uploadBatchFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    setUploading(true)
    setFormError('')
    setUploadProgressText(`Đang tải lên ${files.length} hình ảnh…`)
    try {
      const fd = new FormData()
      for (const f of files) {
        fd.append('files', f)
      }
      fd.append('alt', `${name || 'Dòng xe NORI'} — Ảnh catalogue`)
      fd.append('mediaCategory', 'CATALOGUE_REFERENCE')
      if (source.trim()) fd.append('sourceUrl', source.trim())

      const res = await fetch('/nori-api/dashboard/media', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Chưa thể tải hình ảnh lên.')
      }

      const uploadedList = (json.data.uploaded ?? []) as {
        id: string
        alt: string
        url: string | null
        photo: { url: string; alt: string } | null
      }[]
      const failedList = (json.data.failed ?? []) as { name: string; reason: string }[]

      if (uploadedList.length > 0) {
        markChanged()
        const defaultOpt = photoTypeOptions[0] ?? {
          value: 'EXTERIOR',
          kind: 'EXTERIOR' as const,
          label: 'Ngoại thất',
        }
        setGallery((prev) => {
          const hasExistingPrimary = Boolean(coverId) || prev.some((p) => p.isPrimary)
          const added: GalleryFormItem[] = uploadedList.map((u, idx) => {
            const url = u.photo?.url || u.url || ''
            const makePrimary = !hasExistingPrimary && idx === 0
            if (makePrimary) {
              setCoverId(u.id)
              setCoverPreview(url)
            }
            return {
              imageId: u.id,
              image: { url, alt: u.alt },
              kind: defaultOpt.kind,
              photoType: defaultOpt.value,
              isPrimary: makePrimary,
              sortOrder: prev.length + idx,
              altText: u.alt,
              caption: `${name || 'Dòng xe'} — ${defaultOpt.label}`,
              variantName: '',
              colorName: '',
              sourceUrl: source.trim(),
              license: '',
              verified: true,
            }
          })
          return [...prev, ...added]
        })
      }

      if (failedList.length > 0) {
        setFormError(
          `Đã tải ${uploadedList.length}/${files.length} ảnh. Một số tệp bị từ chối: ${failedList
            .map((f) => `${f.name} (${f.reason})`)
            .join('; ')}`,
        )
      } else {
        toast(`Đã tải thành công ${uploadedList.length} hình ảnh lên Gallery.`)
      }
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setUploading(false)
      setUploadProgressText('')
    }
  }

  function setPrimaryGalleryItem(index: number) {
    markChanged()
    setGallery((prev) =>
      prev.map((item, idx) => {
        const isPrimary = idx === index
        if (isPrimary) {
          setCoverId(item.imageId)
          setCoverPreview(item.image.url)
        }
        return { ...item, isPrimary }
      }),
    )
    toast('Đã đặt làm ảnh đại diện chính của dòng xe.')
  }

  function removeGalleryItem(index: number) {
    markChanged()
    setGallery((prev) => {
      const removed = prev[index]
      const next = prev.filter((_, i) => i !== index).map((g, i) => ({ ...g, sortOrder: i }))
      if (removed && (removed.isPrimary || removed.imageId === coverId)) {
        if (next.length > 0) {
          next[0] = { ...next[0], isPrimary: true }
          setCoverId(next[0].imageId)
          setCoverPreview(next[0].image.url)
          toast('Đã xóa ảnh đại diện cũ và tự động chọn ảnh kế tiếp làm ảnh đại diện.')
        } else {
          setCoverId(null)
          setCoverPreview(null)
        }
      }
      return next
    })
  }

  function moveGalleryItem(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= gallery.length || fromIdx === toIdx) return
    markChanged()
    setGallery((prev) => {
      const copy = [...prev]
      const [moved] = copy.splice(fromIdx, 1)
      copy.splice(toIdx, 0, moved)
      return copy.map((g, i) => ({ ...g, sortOrder: i }))
    })
  }

  async function replaceGalleryImage(index: number, file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('alt', gallery[index]?.altText || `${name || 'Dòng xe'} — Ảnh cập nhật`)
      fd.append('mediaCategory', 'CATALOGUE_REFERENCE')
      const res = await fetch('/nori-api/dashboard/media', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Không thể thay ảnh.')
      const newUrl = json.data.photo?.url || json.data.url
      markChanged()
      setGallery((prev) =>
        prev.map((item, i) => {
          if (i !== index) return item
          if (item.isPrimary || item.imageId === coverId) {
            setCoverId(json.data.id)
            setCoverPreview(newUrl)
          }
          return {
            ...item,
            imageId: json.data.id,
            image: { url: newUrl, alt: json.data.alt },
          }
        }),
      )
      toast('Đã thay thế hình ảnh.')
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function uploadVariantColorImage(vIdx: number, cIdx: number, file: File) {
    setUploading(true)
    try {
      const targetVar = variants[vIdx]
      const targetCol = targetVar?.colors[cIdx]
      const fd = new FormData()
      fd.append('file', file)
      fd.append('alt', `${name} ${targetVar?.name ?? ''} — Màu ${targetCol?.name ?? ''}`.trim())
      fd.append('mediaCategory', 'CATALOGUE_REFERENCE')
      const res = await fetch('/nori-api/dashboard/media', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Không thể tải ảnh màu.')
      const newUrl = json.data.photo?.url || json.data.url
      markChanged()
      setVariants((prev) =>
        prev.map((v, vi) =>
          vi !== vIdx
            ? v
            : {
                ...v,
                colors: v.colors.map((c, ci) =>
                  ci !== cIdx
                    ? c
                    : {
                        ...c,
                        imageId: json.data.id,
                        image: { url: newUrl, alt: json.data.alt },
                      },
                ),
              },
        ),
      )
      toast('Đã gắn ảnh màu sắc theo phiên bản.')
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  function applySpecTemplateValue(
    tpl: { group: SpecFormItem['group']; label: string },
    val: string,
  ) {
    markChanged()
    setSpecifications((prev) => {
      const idx = prev.findIndex((s) => s.label === tpl.label)
      if (!val.trim()) {
        return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev
      }
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], value: val, group: tpl.group }
        return copy
      }
      return [
        ...prev,
        {
          group: tpl.group,
          label: tpl.label,
          value: val,
          variantName: versionName,
          source: source,
        },
      ]
    })
  }

  function togglePresetFeature(presetName: string, presetCat: FeatureFormItem['category']) {
    markChanged()
    setFeatures((prev) => {
      const idx = prev.findIndex((f) => f.name.toLowerCase() === presetName.toLowerCase())
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx)
      }
      return [
        ...prev,
        {
          name: presetName,
          category: presetCat,
          status: 'EQUIPPED',
          variantNote: '',
        },
      ]
    })
  }

  async function saveModel(overrideVerification?: 'DRAFT' | 'VERIFIED' | 'UNVERIFIED') {
    const nextFieldErrors: Record<string, string> = {}
    if (!name.trim()) nextFieldErrors.name = 'Vui lòng nhập tên dòng xe.'
    if (!brand.trim()) nextFieldErrors.brand = 'Vui lòng nhập thương hiệu.'
    if (seats.trim() && (Number(seats) < 1 || Number(seats) > 60)) {
      nextFieldErrors.seats = 'Số chỗ ngồi phải từ 1 đến 60.'
    }
    if (modelYear.trim() && (Number(modelYear) < 1990 || Number(modelYear) > 2035)) {
      nextFieldErrors.modelYear = 'Năm sản xuất phải từ 1990 đến 2035.'
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setActiveTab('overview')
      setFormError('Vui lòng kiểm tra các trường dữ liệu bắt buộc hoặc chưa hợp lệ.')
      return
    }

    setBusy(true)
    setFormError('')
    setFieldErrors({})
    try {
      const cleanedSpecs = specifications.filter((s) => isSpecApplicable(s.label, fuelType))
      const targetVerification = overrideVerification ?? verificationStatus
      const targetVisible = targetVerification === 'DRAFT' ? false : visible

      await api('/dashboard/vehicles', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          entity: 'model',
          ...(editing ? { id: editing.id } : {}),
          name: name.trim(),
          officialName: officialName.trim(),
          modelLine: modelLine.trim(),
          versionName: versionName.trim(),
          generation: generation.trim(),
          brand: brand.trim(),
          category: catField,
          subCategory: subCategory || null,
          bodyStyle: bodyStyle.trim(),
          segment: segment.trim(),
          origin: origin.trim(),
          modelYear: modelYear.trim() ? Number(modelYear.trim()) : null,
          seats: seats.trim() ? Number(seats.trim()) : null,
          fuelType: fuelType || null,
          transmission: transmission.trim(),
          driveType: driveType.trim(),
          listedPrice: listedPrice.trim() ? Number(listedPrice.trim()) : null,
          referenceRentPrice: referenceRentPrice.trim() ? Number(referenceRentPrice.trim()) : null,
          defaultDepositSuggestion: defaultDepositSuggestion.trim()
            ? Number(defaultDepositSuggestion.trim())
            : null,
          suitableFor: suitableFor.trim(),
          usagePurpose: usagePurpose.trim(),
          shortDescription: shortDescription.trim(),
          description: description.trim(),
          exteriorOverview: exteriorOverview.trim(),
          interiorOverview: catField === 'MOTORBIKE' ? '' : interiorOverview.trim(),
          engineOverview: engineOverview.trim(),
          highlights,
          features,
          gallery: gallery.map((g, idx) => ({
            imageId: g.imageId,
            kind: g.kind,
            photoType: g.photoType,
            isPrimary: g.isPrimary,
            sortOrder: idx,
            altText: g.altText,
            caption: g.caption,
            variantName: g.variantName,
            colorName: g.colorName,
            sourceUrl: g.sourceUrl,
            license: g.license,
            verified: g.verified,
          })),
          specifications: cleanedSpecs,
          variants: variants.map((v) => ({
            name: v.name,
            year: v.year,
            listedPrice: v.listedPrice,
            referenceRentPrice: v.referenceRentPrice,
            fuelType: v.fuelType,
            transmission: v.transmission,
            driveType: v.driveType,
            seats: v.seats,
            summary: v.summary,
            colors: v.colors.map((c) => ({
              name: c.name,
              hex: c.hex,
              sourceUrl: c.sourceUrl,
              imageId: c.imageId,
            })),
          })),
          source: source.trim(),
          verificationStatus: targetVerification,
          visible: targetVisible,
          featured,
          sortOrder: Number(sortOrder) || 0,
          coverId,
        }),
      })

      toast(
        targetVerification === 'DRAFT'
          ? `Đã lưu bản nháp dòng xe ${name}.`
          : editing
            ? `Đã cập nhật dòng xe ${name} và đồng bộ lên website.`
            : `Đã thêm mới dòng xe ${name}.`,
      )
      setIsDirty(false)
      setEditorMode('list')
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api(`/dashboard/vehicles?entity=model&id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      })
      toast(`Đã xóa dòng xe ${deleteTarget.name}.`)
      setDeleteTarget(null)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
      setDeleteTarget(null)
    } finally {
      setBusy(false)
    }
  }

  // Duplicate image detection in gallery
  const duplicateImageIds = useMemo(() => {
    const counts = new Map<string, number>()
    for (const g of gallery) {
      counts.set(g.imageId, (counts.get(g.imageId) ?? 0) + 1)
    }
    return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([id]) => id))
  }, [gallery])

  // ==========================================================================
  // FULL 10-TAB VEHICLE MODEL WORKSPACE VIEW
  // ==========================================================================
  if (editorMode === 'edit') {
    const techFeatures = features.filter(
      (f) => f.category === 'COMFORT' || f.category === 'TECHNOLOGY',
    )
    const safetyFeatures = features.filter(
      (f) => f.category === 'SAFETY' || f.category === 'DRIVER_ASSIST',
    )

    return (
      <div className="space-y-5">
        {/* Top Action & Completeness Bar */}
        <div className="sticky top-16 z-20 space-y-3 rounded-card border border-line bg-canvas/95 p-4 shadow-xs backdrop-blur-sm sm:top-18">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={requestCloseEditor}>
                <Icon name="arrow-left" className="size-4" />
                Danh sách dòng xe
              </Button>
              <div>
                <Heading as="h2" size="subtitle">
                  {editing ? `Chỉnh sửa: ${name || editing.name}` : 'Thêm dòng xe Catalogue mới'}
                </Heading>
                <Text className="text-micro text-muted">
                  Danh mục: <strong>{catLabels[catField]}</strong>
                  {fuelType ? ` · ${fuelType}` : ''}
                  {editing?.slug ? ` · /vehicles/${editing.slug}` : ''}
                </Text>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {editing?.slug && (
                <ButtonLink
                  href={`/vehicles/${editing.slug}`}
                  variant="ghost"
                  className="min-h-control-sm px-3 py-1.5 text-caption"
                >
                  Mở trang khách hàng <Icon name="external" className="size-3.5" />
                </ButtonLink>
              )}
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() => void saveModel('DRAFT')}
              >
                Lưu bản nháp
              </Button>
              <Button size="sm" variant="primary" loading={busy} onClick={() => void saveModel()}>
                Lưu & Đồng bộ Website
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5 border-t border-line pt-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-micro">
              <span className="font-semibold text-ink">
                Tiến độ hoàn thiện dữ liệu Catalogue: {completeness.percent}%
              </span>
              {completeness.missing.length > 0 ? (
                <span className="text-muted">
                  Còn thiếu gợi ý: {completeness.missing.slice(0, 4).join(', ')}
                  {completeness.missing.length > 4 ? '…' : ''}
                </span>
              ) : (
                <span className="font-semibold text-brand">Hồ sơ dòng xe đã đầy đủ!</span>
              )}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-pill bg-subtle">
              <div
                className="h-full rounded-pill bg-brand transition-all duration-300"
                style={{ width: `${completeness.percent}%` }}
              />
            </div>
          </div>
        </div>

        {formError && <Notice tone="error">{formError}</Notice>}

        {/* 10 Tabs Bar */}
        <div
          role="tablist"
          aria-label="Các mục quản trị dòng xe"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-line bg-canvas px-2 pt-1 rounded-t-card"
        >
          {EDITOR_TABS.map((t) => (
            <TabButton
              key={t.key}
              selected={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              className="shrink-0 whitespace-nowrap px-3.5 py-2.5 text-caption font-semibold"
            >
              {t.label}
            </TabButton>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6 rounded-card border border-line bg-canvas p-5">
            <Heading as="h3" size="subtitle">
              Thông tin định danh & Phân loại phương tiện
            </Heading>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                id="model-name"
                label="Tên dòng xe hiển thị *"
                required
                value={name}
                error={fieldErrors.name}
                onChange={(e) => {
                  markChanged()
                  setName(e.target.value)
                }}
              />
              <Input
                id="model-official-name"
                label="Tên thương mại chính thức"
                placeholder="Ví dụ: VinFast Evo200 / Toyota Fortuner Legender"
                value={officialName}
                onChange={(e) => {
                  markChanged()
                  setOfficialName(e.target.value)
                }}
              />
              <Input
                id="model-brand"
                label="Thương hiệu *"
                required
                value={brand}
                error={fieldErrors.brand}
                onChange={(e) => {
                  markChanged()
                  setBrand(e.target.value)
                }}
              />
              <Input
                id="model-line"
                label="Dòng sản phẩm (Model Line)"
                placeholder="Fortuner / Ranger / SH / Evo"
                value={modelLine}
                onChange={(e) => {
                  markChanged()
                  setModelLine(e.target.value)
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                id="model-cat"
                label="Danh mục chính *"
                value={catField}
                onChange={(e) => {
                  const nextCat = e.target.value as 'CAR' | 'MOTORBIKE' | 'PICKUP'
                  markChanged()
                  setCatField(nextCat)
                  const nextAllowed = subCategoriesByCategory[nextCat] ?? []
                  if (!nextAllowed.includes(subCategory)) {
                    setSubCategory(nextAllowed[0] ?? '')
                  }
                  if (nextCat === 'MOTORBIKE' && (!seats || Number(seats) > 3)) {
                    setSeats('2')
                  }
                }}
              >
                <option value="CAR">Ô tô</option>
                <option value="MOTORBIKE">Xe máy</option>
                <option value="PICKUP">Xe bán tải</option>
              </Select>

              <Select
                id="model-subcat"
                label="Danh mục con / Kiểu dáng *"
                value={subCategory}
                onChange={(e) => {
                  const sc = e.target.value
                  markChanged()
                  setSubCategory(sc)
                  if (sc === 'ELECTRIC_BIKE' || sc === 'ELECTRIC_CAR') {
                    setFuelType('Điện (EV)')
                  }
                }}
              >
                <option value="">Chưa chọn</option>
                {allowedSubCategories.map((k) => (
                  <option key={k} value={k}>
                    {subCategoryLabels[k] ?? k}
                  </option>
                ))}
              </Select>

              <Select
                id="model-fuel"
                label="Nhiên liệu / Năng lượng"
                value={fuelType}
                onChange={(e) => {
                  markChanged()
                  setFuelType(e.target.value)
                }}
              >
                <option value="">Chưa cập nhật</option>
                <option value="Xăng">Xăng</option>
                <option value="Dầu (Diesel)">Dầu (Diesel)</option>
                <option value="Điện (EV)">Điện (EV)</option>
                <option value="Hybrid">Hybrid</option>
              </Select>

              <Input
                id="model-seats"
                label={catField === 'MOTORBIKE' ? 'Số chỗ ngồi / người chở' : 'Số chỗ ngồi'}
                type="number"
                min={1}
                max={60}
                error={fieldErrors.seats}
                value={seats}
                onChange={(e) => {
                  markChanged()
                  setSeats(e.target.value)
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                id="model-version"
                label="Phiên bản tiêu chuẩn"
                placeholder="Tiêu chuẩn / Plus / Wildtrak 4x4"
                value={versionName}
                onChange={(e) => {
                  markChanged()
                  setVersionName(e.target.value)
                }}
              />
              <Input
                id="model-gen"
                label="Thế hệ"
                placeholder="Thế hệ mới / AN160 / P703"
                value={generation}
                onChange={(e) => {
                  markChanged()
                  setGeneration(e.target.value)
                }}
              />
              <Input
                id="model-year"
                label="Năm áp dụng"
                type="number"
                min={1990}
                max={2035}
                error={fieldErrors.modelYear}
                value={modelYear}
                onChange={(e) => {
                  markChanged()
                  setModelYear(e.target.value)
                }}
              />
              <Input
                id="model-origin"
                label="Xuất xứ (nếu có căn cứ)"
                placeholder="Lắp ráp Việt Nam / Nhập khẩu Thái Lan"
                value={origin}
                onChange={(e) => {
                  markChanged()
                  setOrigin(e.target.value)
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                id="model-segment"
                label="Phân khúc"
                placeholder="SUV cỡ D / Tay ga đô thị / Bán tải hiệu năng cao"
                value={segment}
                onChange={(e) => {
                  markChanged()
                  setSegment(e.target.value)
                }}
              />
              <Input
                id="model-bodystyle"
                label="Kiểu dáng hiển thị"
                placeholder="SUV 7 chỗ / Scooter điện"
                value={bodyStyle}
                onChange={(e) => {
                  markChanged()
                  setBodyStyle(e.target.value)
                }}
              />
              <Input
                id="model-transmission"
                label="Hộp số / Hệ truyền động"
                placeholder="Tự động 6AT / Vô cấp CVT / Truyền động điện Inhub"
                value={transmission}
                onChange={(e) => {
                  markChanged()
                  setTransmission(e.target.value)
                }}
              />
              <Input
                id="model-drivetype"
                label="Hệ dẫn động"
                placeholder="4WD / FWD / Bánh sau"
                value={driveType}
                onChange={(e) => {
                  markChanged()
                  setDriveType(e.target.value)
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="model-suitable"
                label="Đối tượng sử dụng phù hợp"
                placeholder="Gia đình đi du lịch xa, di chuyển hàng ngày nội đô..."
                value={suitableFor}
                onChange={(e) => {
                  markChanged()
                  setSuitableFor(e.target.value)
                }}
              />
              <Input
                id="model-purpose"
                label="Mục đích sử dụng"
                placeholder="Công tác, dã ngoại cuối tuần, đi phố tiết kiệm..."
                value={usagePurpose}
                onChange={(e) => {
                  markChanged()
                  setUsagePurpose(e.target.value)
                }}
              />
            </div>

            <Textarea
              id="model-short-desc"
              label="Mô tả ngắn (tóm tắt nhanh)"
              rows={2}
              value={shortDescription}
              onChange={(e) => {
                markChanged()
                setShortDescription(e.target.value)
              }}
            />
            <Textarea
              id="model-desc"
              label="Mô tả chi tiết tổng quan"
              rows={4}
              value={description}
              onChange={(e) => {
                markChanged()
                setDescription(e.target.value)
              }}
            />

            <div className="grid gap-4 md:grid-cols-3">
              <Textarea
                id="model-ext-ov"
                label="Thiết kế ngoại thất"
                rows={3}
                value={exteriorOverview}
                onChange={(e) => {
                  markChanged()
                  setExteriorOverview(e.target.value)
                }}
              />
              {catField !== 'MOTORBIKE' && (
                <Textarea
                  id="model-int-ov"
                  label="Không gian nội thất & tiện nghi"
                  rows={3}
                  value={interiorOverview}
                  onChange={(e) => {
                    markChanged()
                    setInteriorOverview(e.target.value)
                  }}
                />
              )}
              <Textarea
                id="model-eng-ov"
                label="Động cơ & khả năng vận hành"
                rows={3}
                value={engineOverview}
                onChange={(e) => {
                  markChanged()
                  setEngineOverview(e.target.value)
                }}
              />
            </div>

            {/* Highlights */}
            <div className="space-y-3 border-t border-line pt-4">
              <Text className="font-semibold text-ink">Điểm nổi bật ({highlights.length})</Text>
              <div className="flex gap-2">
                <Input
                  id="new-highlight"
                  label="Thêm điểm nổi bật mới"
                  placeholder="Ví dụ: Quãng đường di chuyển lên đến 203 km/lần sạc..."
                  value={newHighlight}
                  onChange={(e) => setNewHighlight(e.target.value)}
                  wrapperClassName="flex-1"
                />
                <div className="flex items-end">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!newHighlight.trim()) return
                      markChanged()
                      setHighlights((prev) => [...prev, newHighlight.trim()])
                      setNewHighlight('')
                    }}
                  >
                    Thêm
                  </Button>
                </div>
              </div>
              {highlights.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {highlights.map((h, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-control border border-line bg-subtle px-3 py-2 text-small"
                    >
                      <span>{h}</span>
                      <button
                        type="button"
                        onClick={() => {
                          markChanged()
                          setHighlights((prev) => prev.filter((_, i) => i !== idx))
                        }}
                        className="text-danger hover:underline text-caption"
                      >
                        Xóa
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MULTI-IMAGE GALLERY & MEDIA */}
        {activeTab === 'media' && (
          <div className="space-y-6 rounded-card border border-line bg-canvas p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Heading as="h3" size="subtitle">
                  Quản lý Bộ ảnh Catalogue & Góc nhìn ({gallery.length} ảnh)
                </Heading>
                <Text className="text-caption text-muted">
                  Hỗ trợ chọn nhiều file cùng lúc, kéo thả tải lên, đổi thứ tự hiển thị, chọn 1 ảnh
                  đại diện chính và phân loại góc nhìn theo <strong>{catLabels[catField]}</strong>.
                </Text>
              </div>
            </div>

            {/* Drag and Drop Multi-Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                if (e.dataTransfer.files?.length) {
                  void uploadBatchFiles(e.dataTransfer.files)
                }
              }}
              className={`flex flex-col items-center justify-center rounded-card border-2 border-dashed p-6 text-center transition-colors ${
                dragActive ? 'border-brand bg-brand-soft' : 'border-line bg-subtle/50'
              }`}
            >
              <Icon name="upload" className="mb-2 size-8 text-brand" />
              <Text className="text-small font-semibold text-ink">
                {uploading
                  ? uploadProgressText || 'Đang tải ảnh lên…'
                  : 'Kéo thả nhiều hình ảnh vào đây hoặc nhấn để chọn tệp'}
              </Text>
              <Text className="mt-1 text-micro text-muted">
                Định dạng: JPG, PNG, WebP, AVIF · Tối đa 8 MB/ảnh · Tối đa 20 ảnh/lượt
              </Text>
              <label className="mt-3 inline-flex min-h-control-sm cursor-pointer items-center gap-2 rounded-control bg-brand px-4 py-2 text-caption font-semibold text-inverse hover:bg-brand-hover">
                <Icon name="plus" className="size-4" />
                Chọn nhiều ảnh từ máy tính
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadBatchFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>

            {/* Current Primary Cover Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-control border border-line p-3.5">
              <div className="flex items-center gap-3.5">
                {coverPreview ? (
                  <Image
                    src={coverPreview}
                    alt={name || 'Ảnh đại diện'}
                    width={112}
                    height={72}
                    className="h-16 w-28 rounded-control object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-28 items-center justify-center rounded-control bg-subtle text-micro text-muted">
                    Chưa có ảnh
                  </div>
                )}
                <div>
                  <Badge tone="brand">Ảnh đại diện chính (Cover)</Badge>
                  <Text className="mt-1 text-caption text-muted">
                    Hiển thị trên thẻ danh sách phương tiện, kết quả tìm kiếm và đầu trang chi tiết.
                  </Text>
                </div>
              </div>
            </div>

            {duplicateImageIds.size > 0 && (
              <Notice tone="info">
                Phát hiện hình ảnh bị gắn trùng nhiều lần trong Gallery. Hãy kiểm tra và gỡ bớt bản
                sao không cần thiết.
              </Notice>
            )}

            {gallery.length === 0 ? (
              <EmptyState
                icon="car"
                title="Chưa có ảnh trong Gallery"
                description="Tải lên nhiều góc chụp (trước, sau, bên hông, khoang lái, động cơ...) để trang chi tiết tự động hiển thị Gallery đầy đủ."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {gallery.map((item, idx) => {
                  const isPrimary = item.isPrimary || item.imageId === coverId
                  const isDup = duplicateImageIds.has(item.imageId)
                  return (
                    <div
                      key={`${item.imageId}-${idx}`}
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex !== null && dragIndex !== idx) {
                          moveGalleryItem(dragIndex, idx)
                        }
                        setDragIndex(null)
                      }}
                      className={`space-y-3 rounded-card border p-4 ${
                        isPrimary ? 'border-brand bg-soft/40' : 'border-line bg-canvas'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative h-24 w-36 shrink-0 overflow-hidden rounded-control bg-subtle">
                          <Image
                            src={item.image.url}
                            alt={item.altText || item.image.alt}
                            fill
                            sizes="144px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={isPrimary ? 'brand' : 'muted'}>
                              #{idx + 1} {isPrimary ? '· Ảnh đại diện' : ''}
                            </Badge>
                            {isDup && <Badge tone="warning">Ảnh trùng</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {!isPrimary && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setPrimaryGalleryItem(idx)}
                              >
                                Đặt đại diện
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={idx === 0}
                              onClick={() => moveGalleryItem(idx, idx - 1)}
                            >
                              Lên
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={idx === gallery.length - 1}
                              onClick={() => moveGalleryItem(idx, idx + 1)}
                            >
                              Xuống
                            </Button>
                            <label className="inline-flex min-h-control-sm cursor-pointer items-center rounded-control border border-line px-2.5 py-1 text-micro font-semibold hover:border-brand">
                              Thay ảnh
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/avif"
                                className="sr-only"
                                disabled={uploading}
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) void replaceGalleryImage(idx, f)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => removeGalleryItem(idx)}
                            >
                              Xóa
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Select
                          id={`gal-type-${idx}`}
                          label="Phân loại góc chụp"
                          value={item.photoType || item.kind}
                          onChange={(e) => {
                            const selectedOpt = photoTypeOptions.find(
                              (o) => o.value === e.target.value,
                            )
                            markChanged()
                            setGallery((prev) =>
                              prev.map((g, i) =>
                                i !== idx
                                  ? g
                                  : {
                                      ...g,
                                      photoType: e.target.value,
                                      kind: selectedOpt?.kind ?? g.kind,
                                    },
                              ),
                            )
                          }}
                        >
                          {photoTypeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>

                        <Input
                          id={`gal-alt-${idx}`}
                          label="Alt text (mô tả trợ năng)"
                          value={item.altText}
                          onChange={(e) => {
                            markChanged()
                            setGallery((prev) =>
                              prev.map((g, i) =>
                                i !== idx ? g : { ...g, altText: e.target.value },
                              ),
                            )
                          }}
                        />

                        <Input
                          id={`gal-caption-${idx}`}
                          label="Chú thích hiển thị"
                          value={item.caption}
                          onChange={(e) => {
                            markChanged()
                            setGallery((prev) =>
                              prev.map((g, i) =>
                                i !== idx ? g : { ...g, caption: e.target.value },
                              ),
                            )
                          }}
                        />

                        <Input
                          id={`gal-source-${idx}`}
                          label="URL nguồn tham chiếu"
                          value={item.sourceUrl}
                          onChange={(e) => {
                            markChanged()
                            setGallery((prev) =>
                              prev.map((g, i) =>
                                i !== idx ? g : { ...g, sourceUrl: e.target.value },
                              ),
                            )
                          }}
                        />

                        <Input
                          id={`gal-var-${idx}`}
                          label="Phiên bản áp dụng (nếu riêng)"
                          placeholder="Để trống nếu áp dụng chung"
                          value={item.variantName}
                          onChange={(e) => {
                            markChanged()
                            setGallery((prev) =>
                              prev.map((g, i) =>
                                i !== idx ? g : { ...g, variantName: e.target.value },
                              ),
                            )
                          }}
                        />

                        <Input
                          id={`gal-color-${idx}`}
                          label="Màu sắc áp dụng (nếu riêng)"
                          placeholder="Ví dụ: Trắng ngọc trai"
                          value={item.colorName}
                          onChange={(e) => {
                            markChanged()
                            setGallery((prev) =>
                              prev.map((g, i) =>
                                i !== idx ? g : { ...g, colorName: e.target.value },
                              ),
                            )
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DYNAMIC SPECIFICATIONS */}
        {activeTab === 'specs' && (
          <div className="space-y-6 rounded-card border border-line bg-canvas p-5">
            <div>
              <Heading as="h3" size="subtitle">
                Thông số kỹ thuật theo loại phương tiện ({catLabels[catField]}
                {fuelType ? ` · ${fuelType}` : ''})
              </Heading>
              <Text className="text-caption text-muted">
                Biểu mẫu tự động hiển thị bộ thông số chuẩn theo loại xe. Với xe thuần điện (EV), hệ
                thống tự động ẩn thông số xi-lanh/bình xăng không áp dụng và bổ sung nhóm Pin & Sạc.
              </Text>
            </div>

            {/* Dynamic Quick-Fill Templates */}
            <div className="rounded-card bg-subtle p-4 space-y-4">
              <Text className="text-small font-semibold text-ink">
                Nhập nhanh thông số chuẩn cho {catLabels[catField]}
                {isElectricModel ? ' (Thuần điện EV)' : ''}
              </Text>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {specTemplates.map((tpl) => {
                  const existingVal = specifications.find((s) => s.label === tpl.label)?.value ?? ''
                  return (
                    <Input
                      key={`${tpl.group}-${tpl.label}`}
                      id={`tpl-spec-${tpl.label}`}
                      label={tpl.label}
                      placeholder={tpl.placeholder}
                      value={existingVal}
                      onChange={(e) => applySpecTemplateValue(tpl, e.target.value)}
                    />
                  )
                })}
              </div>
            </div>

            {/* Full Custom Specifications Table */}
            <div className="space-y-3 border-t border-line pt-4">
              <div className="flex items-center justify-between">
                <Text className="font-semibold text-ink">
                  Danh sách toàn bộ thông số đã nhập ({specifications.length})
                </Text>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    markChanged()
                    setSpecifications((prev) => [
                      ...prev,
                      {
                        group: isElectricModel ? 'EV' : 'ENGINE',
                        label: '',
                        value: '',
                        variantName: versionName,
                        source: source,
                      },
                    ])
                  }}
                >
                  <Icon name="plus" className="size-4" />
                  Thêm dòng thông số tùy chỉnh
                </Button>
              </div>

              {specifications.map((s, idx) => (
                <div
                  key={idx}
                  className="grid items-end gap-3 rounded-control border border-line p-3 sm:grid-cols-5"
                >
                  <Select
                    id={`spec-grp-${idx}`}
                    label="Nhóm"
                    value={s.group}
                    onChange={(e) => {
                      markChanged()
                      setSpecifications((prev) =>
                        prev.map((item, i) =>
                          i !== idx
                            ? item
                            : { ...item, group: e.target.value as SpecFormItem['group'] },
                        ),
                      )
                    }}
                  >
                    <option value="OVERVIEW">Tổng quan</option>
                    <option value="ENGINE">Động cơ & Vận hành</option>
                    <option value="DIMENSIONS">Kích thước & Trọng lượng</option>
                    <option value="CHASSIS">Khung gầm & Phanh</option>
                    {catField === 'PICKUP' && <option value="PICKUP">Bán tải chuyên biệt</option>}
                    {catField === 'MOTORBIKE' && <option value="MOTORBIKE">Xe máy</option>}
                    {(isElectricModel || fuelType === 'Hybrid') && (
                      <option value="EV">Pin & Sạc (EV)</option>
                    )}
                  </Select>
                  <Input
                    id={`spec-lbl-${idx}`}
                    label="Tên thông số"
                    value={s.label}
                    onChange={(e) => {
                      markChanged()
                      setSpecifications((prev) =>
                        prev.map((item, i) =>
                          i !== idx ? item : { ...item, label: e.target.value },
                        ),
                      )
                    }}
                  />
                  <Input
                    id={`spec-val-${idx}`}
                    label="Giá trị"
                    value={s.value}
                    onChange={(e) => {
                      markChanged()
                      setSpecifications((prev) =>
                        prev.map((item, i) =>
                          i !== idx ? item : { ...item, value: e.target.value },
                        ),
                      )
                    }}
                  />
                  <Input
                    id={`spec-src-${idx}`}
                    label="Nguồn / Phiên bản"
                    value={s.source}
                    onChange={(e) => {
                      markChanged()
                      setSpecifications((prev) =>
                        prev.map((item, i) =>
                          i !== idx ? item : { ...item, source: e.target.value },
                        ),
                      )
                    }}
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      markChanged()
                      setSpecifications((prev) => prev.filter((_, i) => i !== idx))
                    }}
                  >
                    Xóa
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: COMFORT & TECHNOLOGY */}
        {activeTab === 'tech' && (
          <div className="space-y-6 rounded-card border border-line bg-canvas p-5">
            <div>
              <Heading as="h3" size="subtitle">
                Công nghệ & Tiện nghi ({catLabels[catField]})
              </Heading>
              <Text className="text-caption text-muted">
                Không mặc định mọi xe đều có trang bị. Chỉ chọn các trang bị thực tế của dòng xe và
                phân biệt rõ trạng thái xác minh.
              </Text>
            </div>

            <div className="flex flex-wrap gap-2">
              {featurePresets.comfortTech.map((preset) => {
                const selected = features.some(
                  (f) => f.name.toLowerCase() === preset.name.toLowerCase(),
                )
                return (
                  <button
                    key={preset.name}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => togglePresetFeature(preset.name, preset.category)}
                    className={`rounded-pill border px-3.5 py-1.5 text-caption font-medium transition-colors ${
                      selected
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-line bg-subtle text-ink hover:border-brand/50'
                    }`}
                  >
                    {selected ? '✓ ' : '+ '}
                    {preset.name}
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2">
              <Input
                id="custom-tech-name"
                label="Bổ sung tiện nghi / công nghệ khác"
                placeholder="Nhập tên trang bị cụ thể theo hãng..."
                value={customFeatureName}
                onChange={(e) => setCustomFeatureName(e.target.value)}
                wrapperClassName="flex-1"
              />
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!customFeatureName.trim()) return
                    markChanged()
                    setFeatures((prev) => [
                      ...prev,
                      {
                        name: customFeatureName.trim(),
                        category: 'TECHNOLOGY',
                        status: 'EQUIPPED',
                        variantNote: '',
                      },
                    ])
                    setCustomFeatureName('')
                  }}
                >
                  Thêm trang bị
                </Button>
              </div>
            </div>

            {techFeatures.length > 0 && (
              <div className="space-y-2.5">
                {features.map((f, idx) => {
                  if (f.category !== 'COMFORT' && f.category !== 'TECHNOLOGY') return null
                  return (
                    <div
                      key={idx}
                      className="grid items-end gap-3 rounded-control border border-line p-3 sm:grid-cols-4"
                    >
                      <Input
                        id={`feat-name-${idx}`}
                        label="Tên trang bị"
                        value={f.name}
                        onChange={(e) => {
                          markChanged()
                          setFeatures((prev) =>
                            prev.map((item, i) =>
                              i !== idx ? item : { ...item, name: e.target.value },
                            ),
                          )
                        }}
                      />
                      <Select
                        id={`feat-st-${idx}`}
                        label="Trạng thái"
                        value={f.status}
                        onChange={(e) => {
                          markChanged()
                          setFeatures((prev) =>
                            prev.map((item, i) =>
                              i !== idx
                                ? item
                                : {
                                    ...item,
                                    status: e.target.value as FeatureFormItem['status'],
                                  },
                            ),
                          )
                        }}
                      >
                        {Object.entries(featureStatusLabels).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </Select>
                      <Input
                        id={`feat-note-${idx}`}
                        label="Phiên bản áp dụng"
                        placeholder="Tất cả phiên bản / Bản Plus..."
                        value={f.variantNote}
                        onChange={(e) => {
                          markChanged()
                          setFeatures((prev) =>
                            prev.map((item, i) =>
                              i !== idx ? item : { ...item, variantNote: e.target.value },
                            ),
                          )
                        }}
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          markChanged()
                          setFeatures((prev) => prev.filter((_, i) => i !== idx))
                        }}
                      >
                        Xóa
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SAFETY & ADAS */}
        {activeTab === 'safety' && (
          <div className="space-y-6 rounded-card border border-line bg-canvas p-5">
            <div>
              <Heading as="h3" size="subtitle">
                Hệ thống An toàn & Hỗ trợ người lái ({catLabels[catField]})
              </Heading>
              <Text className="text-caption text-muted">
                Chọn các tính năng an toàn đã được xác thực cho phiên bản tương ứng.
              </Text>
            </div>

            <div className="flex flex-wrap gap-2">
              {featurePresets.safety.map((preset) => {
                const selected = features.some(
                  (f) => f.name.toLowerCase() === preset.name.toLowerCase(),
                )
                return (
                  <button
                    key={preset.name}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => togglePresetFeature(preset.name, preset.category)}
                    className={`rounded-pill border px-3.5 py-1.5 text-caption font-medium transition-colors ${
                      selected
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-line bg-subtle text-ink hover:border-brand/50'
                    }`}
                  >
                    {selected ? '✓ ' : '+ '}
                    {preset.name}
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2">
              <Input
                id="custom-safety-name"
                label="Bổ sung tính năng an toàn khác"
                placeholder="Ví dụ: 7 túi khí, Phanh đĩa thủy lực..."
                value={customSafetyName}
                onChange={(e) => setCustomSafetyName(e.target.value)}
                wrapperClassName="flex-1"
              />
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!customSafetyName.trim()) return
                    markChanged()
                    setFeatures((prev) => [
                      ...prev,
                      {
                        name: customSafetyName.trim(),
                        category: 'SAFETY',
                        status: 'EQUIPPED',
                        variantNote: '',
                      },
                    ])
                    setCustomSafetyName('')
                  }}
                >
                  Thêm tính năng an toàn
                </Button>
              </div>
            </div>

            {safetyFeatures.length > 0 && (
              <div className="space-y-2.5">
                {features.map((f, idx) => {
                  if (f.category !== 'SAFETY' && f.category !== 'DRIVER_ASSIST') return null
                  return (
                    <div
                      key={idx}
                      className="grid items-end gap-3 rounded-control border border-line p-3 sm:grid-cols-4"
                    >
                      <Input
                        id={`safe-name-${idx}`}
                        label="Tính năng an toàn"
                        value={f.name}
                        onChange={(e) => {
                          markChanged()
                          setFeatures((prev) =>
                            prev.map((item, i) =>
                              i !== idx ? item : { ...item, name: e.target.value },
                            ),
                          )
                        }}
                      />
                      <Select
                        id={`safe-st-${idx}`}
                        label="Trạng thái"
                        value={f.status}
                        onChange={(e) => {
                          markChanged()
                          setFeatures((prev) =>
                            prev.map((item, i) =>
                              i !== idx
                                ? item
                                : {
                                    ...item,
                                    status: e.target.value as FeatureFormItem['status'],
                                  },
                            ),
                          )
                        }}
                      >
                        {Object.entries(featureStatusLabels).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </Select>
                      <Input
                        id={`safe-note-${idx}`}
                        label="Phiên bản áp dụng"
                        value={f.variantNote}
                        onChange={(e) => {
                          markChanged()
                          setFeatures((prev) =>
                            prev.map((item, i) =>
                              i !== idx ? item : { ...item, variantNote: e.target.value },
                            ),
                          )
                        }}
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          markChanged()
                          setFeatures((prev) => prev.filter((_, i) => i !== idx))
                        }}
                      >
                        Xóa
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: VARIANTS & COLORS */}
        {activeTab === 'variants' && (
          <div className="space-y-5 rounded-card border border-line bg-canvas p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Heading as="h3" size="subtitle">
                  Phiên bản & Màu sắc xác thực ({variants.length})
                </Heading>
                <Text className="text-caption text-muted">
                  Mỗi phiên bản có thông số, giá tham khảo và bộ màu sắc độc lập, không gộp chung
                  nhiều đời xe.
                </Text>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  markChanged()
                  setVariants((prev) => [
                    ...prev,
                    {
                      name: versionName || 'Tiêu chuẩn',
                      year: modelYear ? Number(modelYear) : 2025,
                      listedPrice: listedPrice ? Number(listedPrice) : null,
                      referenceRentPrice: referenceRentPrice ? Number(referenceRentPrice) : null,
                      fuelType: fuelType,
                      transmission: transmission,
                      driveType: driveType,
                      seats: seats ? Number(seats) : null,
                      summary: '',
                      colors: [],
                    },
                  ])
                }}
              >
                <Icon name="plus" className="size-4" />
                Thêm phiên bản
              </Button>
            </div>

            {variants.map((v, vIdx) => (
              <div
                key={vIdx}
                className="space-y-4 rounded-card border border-line bg-subtle/40 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <Text className="font-semibold text-ink">
                    Phiên bản #{vIdx + 1}: {v.name}
                  </Text>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      markChanged()
                      setVariants((prev) => prev.filter((_, i) => i !== vIdx))
                    }}
                  >
                    Xóa phiên bản
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    id={`var-name-${vIdx}`}
                    label="Tên phiên bản *"
                    value={v.name}
                    onChange={(e) => {
                      markChanged()
                      setVariants((prev) =>
                        prev.map((it, i) => (i !== vIdx ? it : { ...it, name: e.target.value })),
                      )
                    }}
                  />
                  <Input
                    id={`var-year-${vIdx}`}
                    label="Năm sản xuất"
                    type="number"
                    value={v.year ?? ''}
                    onChange={(e) => {
                      markChanged()
                      setVariants((prev) =>
                        prev.map((it, i) =>
                          i !== vIdx
                            ? it
                            : { ...it, year: e.target.value ? Number(e.target.value) : null },
                        ),
                      )
                    }}
                  />
                  <Input
                    id={`var-list-${vIdx}`}
                    label="Giá niêm yết (VNĐ)"
                    type="number"
                    value={v.listedPrice ?? ''}
                    onChange={(e) => {
                      markChanged()
                      setVariants((prev) =>
                        prev.map((it, i) =>
                          i !== vIdx
                            ? it
                            : {
                                ...it,
                                listedPrice: e.target.value ? Number(e.target.value) : null,
                              },
                        ),
                      )
                    }}
                  />
                  <Input
                    id={`var-summary-${vIdx}`}
                    label="Tóm tắt trang bị phiên bản"
                    value={v.summary}
                    onChange={(e) => {
                      markChanged()
                      setVariants((prev) =>
                        prev.map((it, i) => (i !== vIdx ? it : { ...it, summary: e.target.value })),
                      )
                    }}
                  />
                </div>

                {/* Colors per variant */}
                <div className="space-y-2.5 border-t border-line pt-3">
                  <div className="flex items-center justify-between">
                    <Text className="text-caption font-semibold text-ink">
                      Màu sắc phiên bản ({v.colors.length})
                    </Text>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        markChanged()
                        setVariants((prev) =>
                          prev.map((it, i) =>
                            i !== vIdx
                              ? it
                              : {
                                  ...it,
                                  colors: [
                                    ...it.colors,
                                    {
                                      name: '',
                                      hex: '#ffffff',
                                      sourceUrl: '',
                                      imageId: null,
                                      image: null,
                                    },
                                  ],
                                },
                          ),
                        )
                      }}
                    >
                      + Thêm màu xe
                    </Button>
                  </div>

                  {v.colors.map((c, cIdx) => (
                    <div
                      key={cIdx}
                      className="grid items-end gap-3 rounded-control bg-canvas p-3 sm:grid-cols-4"
                    >
                      <Input
                        id={`col-name-${vIdx}-${cIdx}`}
                        label="Tên màu chính thức"
                        placeholder="Trắng Ngọc Trai / Đen Nhám..."
                        value={c.name}
                        onChange={(e) => {
                          markChanged()
                          setVariants((prev) =>
                            prev.map((it, i) =>
                              i !== vIdx
                                ? it
                                : {
                                    ...it,
                                    colors: it.colors.map((col, ci) =>
                                      ci !== cIdx ? col : { ...col, name: e.target.value },
                                    ),
                                  },
                            ),
                          )
                        }}
                      />
                      <Input
                        id={`col-hex-${vIdx}-${cIdx}`}
                        label="Mã màu (HEX)"
                        placeholder="#F5F5F5"
                        value={c.hex}
                        onChange={(e) => {
                          markChanged()
                          setVariants((prev) =>
                            prev.map((it, i) =>
                              i !== vIdx
                                ? it
                                : {
                                    ...it,
                                    colors: it.colors.map((col, ci) =>
                                      ci !== cIdx ? col : { ...col, hex: e.target.value },
                                    ),
                                  },
                            ),
                          )
                        }}
                      />
                      <div className="flex items-center gap-2">
                        {c.image && (
                          <Image
                            src={c.image.url}
                            alt={c.name || 'Màu xe'}
                            width={56}
                            height={38}
                            className="h-9 w-14 rounded-xs object-cover"
                          />
                        )}
                        <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-1.5 rounded-control border border-line bg-subtle px-3 py-1.5 text-micro font-semibold hover:border-brand">
                          <Icon name="upload" className="size-3.5" />
                          {c.image ? 'Đổi ảnh màu' : 'Ảnh theo màu'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            className="sr-only"
                            disabled={uploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) void uploadVariantColorImage(vIdx, cIdx, f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          markChanged()
                          setVariants((prev) =>
                            prev.map((it, i) =>
                              i !== vIdx
                                ? it
                                : { ...it, colors: it.colors.filter((_, ci) => ci !== cIdx) },
                            ),
                          )
                        }}
                      >
                        Xóa màu
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 7: PRICING & POLICY */}
        {activeTab === 'pricing' && (
          <div className="space-y-5 rounded-card border border-line bg-canvas p-5">
            <Heading as="h3" size="subtitle">
              Giá tham khảo Catalogue & Trạng thái hiển thị
            </Heading>
            <Notice>
              Giá tại đây là mức tham khảo cấp dòng xe (Catalogue). Giá thuê thực tế, phụ phí cuối
              tuần và tiền đặt cọc khi đặt đơn được tính từ từng <strong>Cá thể xe thực tế</strong>{' '}
              trong kho.
            </Notice>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                id="model-listed-price"
                label="Giá niêm yết tham khảo hãng (VNĐ)"
                type="number"
                min={0}
                value={listedPrice}
                onChange={(e) => {
                  markChanged()
                  setListedPrice(e.target.value)
                }}
              />
              <Input
                id="model-rent-price"
                label="Giá thuê tham khảo từ (VNĐ/ngày)"
                type="number"
                min={0}
                value={referenceRentPrice}
                onChange={(e) => {
                  markChanged()
                  setReferenceRentPrice(e.target.value)
                }}
              />
              <Input
                id="model-deposit-sug"
                label="Tiền đặt cọc tham khảo (VNĐ)"
                type="number"
                min={0}
                value={defaultDepositSuggestion}
                onChange={(e) => {
                  markChanged()
                  setDefaultDepositSuggestion(e.target.value)
                }}
              />
              <Input
                id="model-sort-order"
                label="Thứ tự ưu tiên hiển thị"
                type="number"
                value={sortOrder}
                onChange={(e) => {
                  markChanged()
                  setSortOrder(e.target.value)
                }}
              />
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              <label className="flex items-center gap-2 text-small font-medium">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => {
                    markChanged()
                    setVisible(e.target.checked)
                  }}
                  className="size-4"
                />
                Hiển thị công khai trên Website khách hàng
              </label>
              <label className="flex items-center gap-2 text-small font-medium">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => {
                    markChanged()
                    setFeatured(e.target.checked)
                  }}
                  className="size-4"
                />
                Đưa vào danh sách Dòng xe nổi bật trang chủ
              </label>
            </div>
          </div>
        )}

        {/* TAB 8: LINKED ACTUAL FLEET INSTANCES */}
        {activeTab === 'fleet' && (
          <div className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Heading as="h3" size="subtitle">
                  Danh sách Cá thể xe thực tế liên kết ({editing?.linkedVehicles.length ?? 0})
                </Heading>
                <Text className="text-caption text-muted">
                  Tách biệt rõ thông tin Catalogue (Vehicle Model) và từng chiếc xe vật lý trong kho
                  (Vehicle Instance: ODO, biển số, ảnh thực tế, giá thuê thực tế).
                </Text>
              </div>
              <ButtonLink
                href={`/dashboard/vehicles${editing ? `?q=${encodeURIComponent(editing.name)}` : ''}`}
                variant="secondary"
                className="min-h-control-sm px-3.5 py-2 text-caption"
              >
                Mở Quản lý Kho xe thực tế
              </ButtonLink>
            </div>

            {!editing || editing.linkedVehicles.length === 0 ? (
              <Notice>
                Dòng xe này hiện chưa có cá thể xe thực tế nào trong kho. Khách hàng vẫn có thể xem
                Catalogue bình thường nhưng hệ thống sẽ khóa nút đặt thuê để đảm bảo minh bạch.
              </Notice>
            ) : (
              <div className="divide-y divide-line rounded-control border border-line">
                {editing.linkedVehicles.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-small"
                  >
                    <div>
                      <span className="font-semibold text-ink">{v.reference}</span>
                      {v.isDemo && (
                        <Badge tone="warning" className="ml-2">
                          DEMO
                        </Badge>
                      )}
                      <Text className="text-caption text-muted">
                        {[v.version, v.color].filter(Boolean).join(' · ') || 'Phiên bản tiêu chuẩn'}{' '}
                        · ODO:{' '}
                        {v.odometer != null
                          ? `${v.odometer.toLocaleString('vi-VN')} km`
                          : 'Chưa cập nhật'}
                      </Text>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-caption font-semibold text-brand">
                        {formatMoney(v.pricePerDay)}/ngày
                      </span>
                      <Badge tone="muted">
                        {operationStatusLabels[v.operationStatus] ?? v.operationStatus}
                      </Badge>
                      <NoriLink
                        href={`/dashboard/vehicles?q=${encodeURIComponent(v.reference)}`}
                        className="text-caption font-semibold text-brand hover:underline"
                      >
                        Quản lý xe này
                      </NoriLink>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 9: SOURCES & VERIFICATION */}
        {activeTab === 'sources' && (
          <div className="space-y-5 rounded-card border border-line bg-canvas p-5">
            <Heading as="h3" size="subtitle">
              Nguồn tham chiếu chính thức & Trạng thái xác minh
            </Heading>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="model-source-url"
                label="URL nguồn thông số chính thức (Website hãng / Tài liệu kỹ thuật)"
                placeholder="https://vinfastauto.com/..."
                value={source}
                onChange={(e) => {
                  markChanged()
                  setSource(e.target.value)
                }}
              />
              <Select
                id="model-ver-status"
                label="Trạng thái xác minh dữ liệu"
                value={verificationStatus}
                onChange={(e) => {
                  markChanged()
                  setVerificationStatus(e.target.value)
                }}
              >
                <option value="VERIFIED">Đã xác minh từ nguồn chính thống</option>
                <option value="UNVERIFIED">Chưa xác minh đầy đủ (Cần rà soát thêm)</option>
                <option value="DRAFT">Bản nháp nội bộ (Tạm ẩn công khai)</option>
              </Select>
            </div>
          </div>
        )}

        {/* TAB 10: CUSTOMER PREVIEW */}
        {activeTab === 'preview' && (
          <div className="space-y-5 rounded-card border border-line bg-canvas p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <div>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge tone="brand">{brand || 'Thương hiệu'}</Badge>
                  <Badge>
                    {subCategory ? subCategoryLabels[subCategory] : catLabels[catField]}
                  </Badge>
                  {modelYear && <Badge>Đời {modelYear}</Badge>}
                  <Badge>Xem trước giao diện khách hàng</Badge>
                </div>
                <Heading as="h3" size="title">
                  {name || 'Tên dòng xe'}
                </Heading>
                {officialName && (
                  <Text className="text-caption text-muted">Tên thương mại: {officialName}</Text>
                )}
              </div>
              <div className="text-right">
                <Text className="text-caption text-muted">Thuê tham khảo từ</Text>
                <Text className="text-title font-semibold text-brand">
                  {formatMoney(referenceRentPrice ? Number(referenceRentPrice) : null)}
                </Text>
              </div>
            </div>

            {coverPreview && (
              <div className="relative h-64 w-full overflow-hidden rounded-card bg-subtle">
                <Image
                  src={coverPreview}
                  alt={name || 'Preview'}
                  fill
                  sizes="80vw"
                  className="object-cover"
                />
                <Badge tone="inverse" className="absolute left-3 top-3">
                  Ảnh Catalogue – không phải hình ảnh của cá thể xe đang cho thuê.
                </Badge>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 rounded-control bg-subtle p-4 sm:grid-cols-4 text-small">
              <div>
                <span className="text-micro text-muted">Số chỗ ngồi</span>
                <p className="font-semibold">{seats ? `${seats} chỗ` : 'Chưa cập nhật'}</p>
              </div>
              <div>
                <span className="text-micro text-muted">Năng lượng</span>
                <p className="font-semibold">{fuelType || 'Chưa cập nhật'}</p>
              </div>
              <div>
                <span className="text-micro text-muted">Hộp số / Truyền động</span>
                <p className="font-semibold">{transmission || 'Chưa cập nhật'}</p>
              </div>
              <div>
                <span className="text-micro text-muted">Giá niêm yết</span>
                <p className="font-semibold">
                  {formatMoney(listedPrice ? Number(listedPrice) : null)}
                </p>
              </div>
            </div>

            <Text className="whitespace-pre-line text-small text-muted">
              {description || 'Chưa cập nhật mô tả tổng quan.'}
            </Text>
          </div>
        )}

        <Dialog
          open={confirmDiscardOpen}
          onClose={() => setConfirmDiscardOpen(false)}
          title="Rời trang chỉnh sửa chưa lưu?"
        >
          <div className="space-y-4">
            <Text className="text-small text-muted">
              Bạn có thay đổi chưa được lưu trên biểu mẫu dòng xe. Nếu thoát ngay bây giờ, các chỉnh
              sửa vừa nhập sẽ bị hủy.
            </Text>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirmDiscardOpen(false)}>
                Tiếp tục chỉnh sửa
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmDiscardOpen(false)
                  setIsDirty(false)
                  setEditorMode('list')
                }}
              >
                Bỏ thay đổi & Quay lại
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    )
  }

  // ==========================================================================
  // CATALOGUE MODELS LIST VIEW
  // ==========================================================================
  const hasActiveFilters = Boolean(
    q.trim() || category || brandFilter || subCategoryFilter || verificationFilter || visibleFilter,
  )

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-card border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading as="h2" size="subtitle">
              Quản trị Catalogue Dòng xe & Nhập dữ liệu từ hãng
            </Heading>
            <Text className="text-caption text-muted">
              Quản lý thông số kỹ thuật, phiên bản, hình ảnh chính hãng tách biệt hoàn toàn với kho
              xe thực tế.
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={openCreate}>
              <Icon name="plus" className="size-4" />
              Thêm dòng xe thủ công
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openImportDrawer('URL')}>
              <Icon name="globe" className="size-4" />
              Nhập từ website hãng
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openImportDrawer('AI_SEARCH')}>
              <Icon name="sparkles" className="size-4" />
              Tìm kiếm thông minh
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openImportDrawer('BULK')}>
              <Icon name="upload" className="size-4" />
              Nhập hàng loạt
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openImportDrawer('PDF_BROCHURE')}>
              <Icon name="file" className="size-4" />
              Nhập từ brochure
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openImportDrawer('HISTORY')}>
              <Icon name="clock" className="size-4" />
              Lịch sử nhập liệu
            </Button>
          </div>
        </div>

        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-6">
          <Input
            id="model-search"
            label="Tìm kiếm dòng xe"
            placeholder="Tên dòng xe, thương hiệu..."
            value={q}
            onChange={(e) => {
              setPage(1)
              setQ(e.target.value)
            }}
          />
          <Select
            id="model-cat-filter"
            label="Danh mục"
            value={category}
            onChange={(e) => {
              setPage(1)
              setCategory(e.target.value)
              setSubCategoryFilter('')
            }}
          >
            <option value="">Tất cả danh mục</option>
            <option value="CAR">Ô tô</option>
            <option value="MOTORBIKE">Xe máy</option>
            <option value="PICKUP">Bán tải</option>
          </Select>
          <Select
            id="model-brand-filter"
            label="Thương hiệu"
            value={brandFilter}
            onChange={(e) => {
              setPage(1)
              setBrandFilter(e.target.value)
            }}
          >
            <option value="">Tất cả thương hiệu</option>
            {brandFilterOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
          <Select
            id="model-subcat-filter"
            label="Phân loại kiểu dáng"
            value={subCategoryFilter}
            onChange={(e) => {
              setPage(1)
              setSubCategoryFilter(e.target.value)
            }}
          >
            <option value="">Tất cả phân loại</option>
            {subCategoryFilterOptions.map((sc) => (
              <option key={sc} value={sc}>
                {subCategoryLabels[sc] ?? sc}
              </option>
            ))}
          </Select>
          <Select
            id="model-ver-filter"
            label="Trạng thái xác minh"
            value={verificationFilter}
            onChange={(e) => {
              setPage(1)
              setVerificationFilter(e.target.value)
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="VERIFIED">Đã xác minh</option>
            <option value="UNVERIFIED">Cần xác minh</option>
            <option value="DRAFT">Bản nháp</option>
          </Select>
          <Select
            id="model-visible-filter"
            label="Hiển thị công khai"
            value={visibleFilter}
            onChange={(e) => {
              setPage(1)
              setVisibleFilter(e.target.value)
            }}
          >
            <option value="">Tất cả</option>
            <option value="true">Đang công khai</option>
            <option value="false">Đang ẩn</option>
          </Select>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPage(1)
                setQ('')
                setCategory('')
                setBrandFilter('')
                setSubCategoryFilter('')
                setVerificationFilter('')
                setVisibleFilter('')
              }}
            >
              Đặt lại bộ lọc
            </Button>
          </div>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="sliders"
          title="Không tìm thấy dòng xe Catalogue"
          description="Thử thay đổi bộ lọc hoặc thêm dòng xe mới."
        />
      ) : (
        <div className="space-y-4">
          <Text className="text-caption text-muted">
            Hiển thị {items.length} / {totalDocs} dòng xe Catalogue (Vehicle Models)
          </Text>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => (
              <article
                key={m.id}
                className="flex flex-col justify-between rounded-card border border-line bg-canvas p-4 transition-shadow hover:shadow-card"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {m.cover ? (
                      <Image
                        src={m.cover.url}
                        alt={m.cover.alt}
                        width={96}
                        height={64}
                        className="h-16 w-24 shrink-0 rounded-control object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-control bg-subtle text-muted">
                        <Icon name="car" className="size-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Heading as="h2" size="body" className="truncate font-semibold">
                        {m.name}
                      </Heading>
                      <Text className="text-caption text-muted">
                        {m.brand} · {catLabels[m.category] ?? m.category}
                        {m.subCategory
                          ? ` · ${subCategoryLabels[m.subCategory] ?? m.subCategory}`
                          : ''}
                      </Text>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge tone={m.visible ? 'brand' : 'muted'}>
                          {m.visible ? 'Công khai' : 'Đang ẩn'}
                        </Badge>
                        {m.verificationStatus === 'VERIFIED' && (
                          <Badge tone="brand">Đã xác minh</Badge>
                        )}
                        {m.verificationStatus === 'UNVERIFIED' && (
                          <Badge tone="warning">Cần xác minh</Badge>
                        )}
                        {m.verificationStatus === 'DRAFT' && <Badge tone="muted">Bản nháp</Badge>}
                        {(m.lockedFields?.length ?? 0) > 0 && (
                          <Badge tone="muted">Khóa {m.lockedFields!.length} trường</Badge>
                        )}
                        <Badge tone="muted">{m.fleetCount} xe thực tế</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-control bg-subtle p-2.5 text-caption">
                    <span>Thuê từ: {formatMoney(m.referenceRentPrice)}</span>
                    <span>Niêm yết: {formatMoney(m.listedPrice)}</span>
                    <span>
                      Ảnh Gallery: {m.galleryCount + (m.cover ? 1 : 0)} · Thông số: {m.specsCount}
                    </span>
                    <span>
                      Trang bị: {m.featuresCount} · Phiên bản: {m.variantsCount}
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(m)}>
                      Chỉnh sửa đầy đủ (10 Tabs)
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openImportDrawer('SYNC', m)}>
                      <Icon name="refresh" className="size-3.5" />
                      Đồng bộ từ nhà sản xuất
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleteTarget(m)}
                    aria-label={`Xóa dòng xe ${m.name}`}
                  >
                    <Icon name="trash" className="size-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Text className="text-caption text-muted">
                Trang {page} / {totalPages}
              </Text>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trang trước
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Trang sau
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Xác nhận xóa dòng xe Catalogue"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <Text className="text-small">
              Xác nhận xóa dòng xe <strong>{deleteTarget.name}</strong>? Dòng xe đang có xe thực tế
              liên kết sẽ được bảo vệ khỏi việc xóa.
            </Text>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Hủy
              </Button>
              <Button variant="danger" loading={busy} onClick={() => void handleDelete()}>
                Xác nhận xóa
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {importDrawerOpen && (
        <SmartImportDrawer
          open={importDrawerOpen}
          initialMode={importDrawerMode}
          targetModel={importTargetModel}
          onClose={() => setImportDrawerOpen(false)}
          onImported={() => setRetry((r) => r + 1)}
          onSwitchToManual={openFromImportDraft}
        />
      )}
    </div>
  )
}

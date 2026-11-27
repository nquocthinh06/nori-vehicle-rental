'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, RequestError } from '@/lib/client-api'
import { formatDate, formatMoney, isSpecApplicable, subCategoryLabels } from '@/lib/rental-rules'
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ExternalLink,
  Heading,
  Input,
  Notice,
  Select,
  Skeleton,
  TabButton,
  Text,
  Textarea,
  cn,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

export type SmartImportMode =
  | 'URL'
  | 'AI_SEARCH'
  | 'BULK'
  | 'PDF_BROCHURE'
  | 'MANUAL'
  | 'HISTORY'
  | 'SYNC'

export type SmartImportTargetModel = {
  id: string
  name: string
  brand: string
  slug: string
  source: string | null
  modelYear: number | null
  lockedFields?: string[]
  verificationStatus?: string
}

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

export type ConflictPolicy = 'OVERWRITE_UNLOCKED' | 'MERGE_EMPTY' | 'SKIP_EXISTING'

export type FieldDiffItem = {
  field: string
  label?: string
  currentValue: unknown
  proposedValue: unknown
  source?: string | null
  confidence?: number | null
  locked?: boolean
  selected?: boolean
  changed?: boolean
  protectedField?: boolean
}

export type UncertaintyFlag = {
  field?: string
  label?: string
  reason?: string
  message?: string
  severity?: 'WARN' | 'REVIEW' | 'warning' | 'info' | 'error'
  pageRef?: number | string | null
  snippet?: string | null
  evidenceSnippet?: string | null
  status?: string
}

export type MediaCandidate = {
  id?: string
  url: string
  kind?: 'OVERVIEW' | 'EXTERIOR' | 'INTERIOR' | 'ENGINE' | 'FEATURE'
  photoType?: string | null
  altText?: string | null
  caption?: string | null
  sourceUrl?: string | null
  license?: string | null
  verified?: boolean
  selected?: boolean
}

export type ExtractedDraftPreview = {
  name?: string
  officialName?: string
  brand?: string
  category?: 'CAR' | 'MOTORBIKE' | 'PICKUP'
  subCategory?: string | null
  modelYear?: number | null
  versionName?: string
  market?: string
  seats?: number | null
  fuelType?: string | null
  transmission?: string | null
  driveType?: string | null
  listedPrice?: number | null
  msrpReferenceVnd?: number | null
  shortDescription?: string
  description?: string
  exteriorOverview?: string
  interiorOverview?: string
  engineOverview?: string
  highlights?: string[]
  source?: string | null
  sourceUrl?: string | null
  importSourceUrl?: string | null
  verificationStatus?: string
  imageLicenseStatus?: string | null
  missingFields?: string[]
  warnings?: string[]
  specifications?: {
    group: string
    label: string
    value: string
    variantName?: string
    source?: string
    pageRef?: number | string | null
    confidence?: number | null
    unverified?: boolean
  }[]
  variants?: {
    name: string
    year?: number | null
    listedPrice?: number | null
    colors?: { name: string; hex?: string; sourceUrl?: string }[]
  }[]
  gallery?: MediaCandidate[]
  mediaCandidates?: MediaCandidate[]
}

export type BulkPreviewItem = {
  index?: number
  id?: string
  jobId?: string
  input: string
  inputType?: string
  status: ImportJobStatus | string
  brand?: string | null
  modelName?: string | null
  slug?: string | null
  sourceUrl?: string | null
  draft?: ExtractedDraftPreview | null
  diff?: FieldDiffItem[] | null
  existingModelMatch?: {
    id: string
    name: string
    brand?: string
    slug?: string
    lockedFields?: string[]
  } | null
  uncertaintyFlags?: UncertaintyFlag[] | null
  errorCode?: string | null
  errorMessage?: string | null
}

export type ImportJobRecord = {
  id: string
  jobCode?: string
  method: string
  status: ImportJobStatus | string
  currentStage?: string | null
  progressPct?: number | null
  targetModelId?: string | null
  targetModelName?: string | null
  targetModel?: {
    id: string
    name: string
    brand?: string
    slug?: string
    lockedFields?: string[]
  } | null
  sourceInput?: Record<string, unknown> | null
  normalizedDraft?: ExtractedDraftPreview | null
  diffPreview?: FieldDiffItem[] | null
  uncertaintyFlags?: UncertaintyFlag[] | null
  mediaReport?: {
    downloaded?: number
    deduplicated?: number
    failed?: number
    summary?: string
  } | null
  canRollback?: boolean
  hasRollbackSnapshot?: boolean
  rollbackSnapshot?: unknown
  errorCode?: string | null
  errorMessage?: string | null
  attemptCount?: number
  startedAt?: string | null
  finishedAt?: string | null
  createdAt?: string | null
}

type PreviewApiResponse = {
  job: ImportJobRecord
  preview?: ExtractedDraftPreview | null
  diff?: FieldDiffItem[] | null
  uncertaintyFlags?: UncertaintyFlag[] | null
  existingModelMatch?: {
    id: string
    name: string
    brand?: string
    slug?: string
    lockedFields?: string[]
  } | null
  mediaCandidates?: MediaCandidate[] | null
  bulkItems?: BulkPreviewItem[] | null
  aiConfigured?: boolean
  aiMessage?: string | null
}

type JobsListResponse = {
  items: ImportJobRecord[]
  totalDocs?: number
  totalPages?: number
  page?: number
  aiAvailable?: boolean
  aiReason?: string | null
  aiStatus?: string
  aiMessage?: string | null
  activeCount?: number
  maxConcurrency?: number
}

const SUPPORTED_BRANDS = [
  { name: 'Toyota', domain: 'toyota.com.vn' },
  { name: 'Honda', domain: 'honda.com.vn' },
  { name: 'Ford', domain: 'ford.com.vn' },
  { name: 'Mitsubishi', domain: 'mitsubishi-motors.com.vn' },
  { name: 'Mazda', domain: 'mazdamotors.vn' },
  { name: 'Hyundai', domain: 'hyundai.thanhcong.vn' },
  { name: 'Mercedes-Benz', domain: 'mercedes-benz.com.vn' },
  { name: 'VinFast', domain: 'vinfastauto.com' },
  { name: 'Yamaha', domain: 'yamaha-motor.com.vn' },
  { name: 'Kawasaki', domain: 'kawasakivietnam.vn' },
] as const

const DATA_GROUP_OPTIONS: { id: ImportDataGroup; label: string }[] = [
  { id: 'banner', label: 'Banner' },
  { id: 'overview', label: 'Ảnh tổng thể' },
  { id: 'exterior', label: 'Ảnh ngoại thất' },
  { id: 'interior', label: 'Ảnh nội thất' },
  { id: 'technology', label: 'Ảnh công nghệ' },
  { id: 'specs', label: 'Thông số kỹ thuật' },
  { id: 'variants', label: 'Phiên bản' },
  { id: 'colors', label: 'Màu sắc' },
  { id: 'description', label: 'Mô tả' },
  { id: 'source', label: 'Nguồn dữ liệu' },
]

const ALL_DATA_GROUPS = DATA_GROUP_OPTIONS.map((g) => g.id)

const JOB_STATUS_LABELS: Record<string, string> = {
  QUEUED: 'Đang xếp hàng',
  FETCHING: 'Đang tải nguồn',
  EXTRACTING: 'Đang trích xuất',
  NORMALIZING: 'Đang chuẩn hóa',
  VALIDATING: 'Đang kiểm tra',
  PREVIEW_READY: 'Sẵn sàng xem trước',
  AWAITING_APPROVAL: 'Chờ xác nhận nhập',
  IMPORTING: 'Đang lưu dữ liệu',
  COMPLETED: 'Hoàn thành',
  PARTIAL_SUCCESS: 'Hoàn thành một phần',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
}

const ACTIVE_JOB_STATUSES = new Set([
  'QUEUED',
  'FETCHING',
  'EXTRACTING',
  'NORMALIZING',
  'VALIDATING',
  'IMPORTING',
])

const MAX_PDF_BYTES = 25 * 1024 * 1024
const POLL_INTERVAL_MS = 2500
const POLL_MAX_DURATION_MS = 120_000

function formatFieldValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return 'Chưa cập nhật'
  if (typeof val === 'number') return val.toLocaleString('vi-VN')
  if (typeof val === 'boolean') return val ? 'Có' : 'Không'
  if (Array.isArray(val)) return `${val.length} mục`
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function jobTone(status: string): 'brand' | 'warning' | 'danger' | 'muted' {
  if (status === 'COMPLETED') return 'brand'
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger'
  if (
    status === 'PARTIAL_SUCCESS' ||
    status === 'PREVIEW_READY' ||
    status === 'AWAITING_APPROVAL'
  ) {
    return 'warning'
  }
  return 'muted'
}

export function SmartImportDrawer({
  open,
  initialMode,
  targetModel,
  onClose,
  onImported,
  onSwitchToManual,
}: {
  open: boolean
  initialMode: SmartImportMode
  targetModel?: SmartImportTargetModel | null
  onClose: () => void
  onImported: () => void
  onSwitchToManual: (draft?: ExtractedDraftPreview | null) => void
}) {
  const { toast } = useToast()

  const resolvedInitialTab = initialMode === 'SYNC' ? 'URL' : initialMode
  const [activeTab, setActiveTab] = useState<Exclude<SmartImportMode, 'SYNC'>>(resolvedInitialTab)

  // Method 1: URL Import / Manufacturer Sync
  const [urlInput, setUrlInput] = useState(targetModel?.source ?? '')
  const [dataGroups, setDataGroups] = useState<ImportDataGroup[]>(ALL_DATA_GROUPS)
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('OVERWRITE_UNLOCKED')

  // Method 2: AI Smart Search
  const [aiBrand, setAiBrand] = useState(targetModel?.brand ?? '')
  const [aiModelName, setAiModelName] = useState(targetModel?.name ?? '')
  const [aiYear, setAiYear] = useState(targetModel?.modelYear ? String(targetModel.modelYear) : '')
  const [aiVariant, setAiVariant] = useState('')
  const [aiMarket, setAiMarket] = useState('VN')
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  const [aiNotice, setAiNotice] = useState<string | null>(null)

  // Method 3: Bulk Import
  const [bulkInputType, setBulkInputType] = useState<'URLS' | 'MODELS' | 'CSV_JSON'>('URLS')
  const [bulkText, setBulkText] = useState('')
  const [bulkItems, setBulkItems] = useState<BulkPreviewItem[]>([])

  // Method 4: PDF Brochure
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfBrand, setPdfBrand] = useState(targetModel?.brand ?? '')
  const [pdfModelName, setPdfModelName] = useState(targetModel?.name ?? '')
  const [pdfYear, setPdfYear] = useState(
    targetModel?.modelYear ? String(targetModel.modelYear) : '',
  )
  const [pdfSourceUrl, setPdfSourceUrl] = useState(targetModel?.source ?? '')

  // Preview Before Save & Diff State
  const [previewBusy, setPreviewBusy] = useState(false)
  const [approveBusy, setApproveBusy] = useState(false)
  const [lockBusyField, setLockBusyField] = useState<string | null>(null)
  const [drawerError, setDrawerError] = useState('')
  const [activeJob, setActiveJob] = useState<ImportJobRecord | null>(null)
  const [previewDraft, setPreviewDraft] = useState<ExtractedDraftPreview | null>(null)
  const [editableDraft, setEditableDraft] = useState<ExtractedDraftPreview | null>(null)
  const [inlineEditMode, setInlineEditMode] = useState(false)
  const [diffRows, setDiffRows] = useState<FieldDiffItem[]>([])
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set())
  const [lockedFields, setLockedFields] = useState<Set<string>>(
    new Set(targetModel?.lockedFields ?? []),
  )
  const [uncertaintyFlags, setUncertaintyFlags] = useState<UncertaintyFlag[]>([])
  const [matchedModel, setMatchedModel] = useState<{
    id: string
    name: string
    brand?: string
    slug?: string
    lockedFields?: string[]
  } | null>(
    targetModel
      ? {
          id: targetModel.id,
          name: targetModel.name,
          brand: targetModel.brand,
          slug: targetModel.slug,
          lockedFields: targetModel.lockedFields,
        }
      : null,
  )
  const [mediaCandidates, setMediaCandidates] = useState<MediaCandidate[]>([])
  const [downloadMedia, setDownloadMedia] = useState(true)
  const [brokenPreviewUrls, setBrokenPreviewUrls] = useState<Set<string>>(new Set())

  // History State
  const [jobs, setJobs] = useState<ImportJobRecord[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsStatusFilter, setJobsStatusFilter] = useState('')
  const [jobsPage, setJobsPage] = useState(1)
  const [jobsTotalPages, setJobsTotalPages] = useState(1)
  const [rollbackTargetJob, setRollbackTargetJob] = useState<ImportJobRecord | null>(null)
  const [actionJobId, setActionJobId] = useState<string | null>(null)

  // Unsaved-changes guard
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const pollStartedAtRef = useRef<number | null>(null)

  // Sync mode/targetModel when drawer opens with new props
  useEffect(() => {
    if (!open) return
    setActiveTab(initialMode === 'SYNC' ? 'URL' : initialMode)
    setDrawerError('')
    if (targetModel) {
      setUrlInput(targetModel.source ?? '')
      setAiBrand(targetModel.brand)
      setAiModelName(targetModel.name)
      setAiYear(targetModel.modelYear ? String(targetModel.modelYear) : '')
      setPdfBrand(targetModel.brand)
      setPdfModelName(targetModel.name)
      setPdfYear(targetModel.modelYear ? String(targetModel.modelYear) : '')
      setPdfSourceUrl(targetModel.source ?? '')
      setMatchedModel({
        id: targetModel.id,
        name: targetModel.name,
        brand: targetModel.brand,
        slug: targetModel.slug,
        lockedFields: targetModel.lockedFields,
      })
      setLockedFields(new Set(targetModel.lockedFields ?? []))
    }
  }, [open, initialMode, targetModel])

  // Browser unload warning when unsaved preview/edits exist
  useEffect(() => {
    if (!open || !hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [open, hasUnsavedChanges])

  const loadJobs = useCallback(
    async (silent = false) => {
      if (!silent) setJobsLoading(true)
      try {
        const sp = new URLSearchParams({
          page: String(jobsPage),
          ...(jobsStatusFilter ? { status: jobsStatusFilter } : {}),
        })
        const res = await api<JobsListResponse>(`/dashboard/catalogue-import/jobs?${sp.toString()}`)
        setJobs(res.items ?? [])
        setJobsTotalPages(res.totalPages ?? 1)
        if (typeof res.aiAvailable === 'boolean') setAiAvailable(res.aiAvailable)
        const reason = res.aiReason ?? res.aiMessage
        if (reason !== undefined) setAiNotice(reason)
      } catch (err) {
        if (!silent) setDrawerError((err as Error).message)
      } finally {
        if (!silent) setJobsLoading(false)
      }
    },
    [jobsPage, jobsStatusFilter],
  )

  useEffect(() => {
    if (!open) return
    if (activeTab === 'HISTORY' || activeTab === 'AI_SEARCH') {
      void loadJobs(activeTab === 'AI_SEARCH')
    }
  }, [open, activeTab, loadJobs])

  const applyPreviewPayload = useCallback(
    (payload: PreviewApiResponse) => {
      const job = payload.job
      const draft = payload.preview ?? job.normalizedDraft ?? null
      const diff = payload.diff ?? job.diffPreview ?? []
      const flags = payload.uncertaintyFlags ?? job.uncertaintyFlags ?? []
      const jobTarget =
        job.targetModel && typeof job.targetModel === 'object'
          ? {
              id: String(job.targetModel.id),
              name: String(job.targetModel.name ?? ''),
              brand: job.targetModel.brand,
              slug: job.targetModel.slug,
              lockedFields: Array.isArray(job.targetModel.lockedFields)
                ? job.targetModel.lockedFields
                : undefined,
            }
          : null
      const match = payload.existingModelMatch ?? jobTarget ?? null
      const candidates = payload.mediaCandidates ?? draft?.mediaCandidates ?? draft?.gallery ?? []

      setActiveJob(job)
      setPreviewDraft(draft)
      setEditableDraft(draft ? { ...draft } : null)
      setInlineEditMode(false)
      setDiffRows(diff)
      setUncertaintyFlags(flags)
      setBulkItems(payload.bulkItems ?? [])
      setMediaCandidates(candidates.map((c) => ({ ...c, selected: c.selected !== false })))

      if (match) {
        setMatchedModel(match)
        if (match.lockedFields) setLockedFields(new Set(match.lockedFields))
      }

      const nextLocked = new Set(match?.lockedFields ?? Array.from(lockedFields))
      const initialSelected = new Set<string>()
      for (const row of diff) {
        const isLocked = row.locked || nextLocked.has(row.field)
        const shouldSelect =
          typeof row.selected === 'boolean'
            ? row.selected && !isLocked && !row.protectedField
            : !isLocked &&
              !row.protectedField &&
              (row.changed !== false || row.proposedValue != null)
        if (shouldSelect) {
          initialSelected.add(row.field)
        }
      }
      setSelectedFields(initialSelected)
      if (typeof payload.aiConfigured === 'boolean') setAiAvailable(payload.aiConfigured)
      if (payload.aiMessage) setAiNotice(payload.aiMessage)
      setHasUnsavedChanges(Boolean(draft))
    },
    [lockedFields],
  )

  // Bounded polling ONLY when active job or visible history has in-progress jobs
  useEffect(() => {
    if (!open) return
    const activeJobIsRunning = activeJob && ACTIVE_JOB_STATUSES.has(activeJob.status)
    const historyHasRunning =
      activeTab === 'HISTORY' && jobs.some((j) => ACTIVE_JOB_STATUSES.has(j.status))

    if (!activeJobIsRunning && !historyHasRunning) {
      pollStartedAtRef.current = null
      return
    }

    if (!pollStartedAtRef.current) {
      pollStartedAtRef.current = Date.now()
    }

    let cancelled = false
    const timer = window.setInterval(() => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (
        pollStartedAtRef.current &&
        Date.now() - pollStartedAtRef.current > POLL_MAX_DURATION_MS
      ) {
        window.clearInterval(timer)
        return
      }
      if (activeJobIsRunning && activeJob) {
        api<PreviewApiResponse>(
          `/dashboard/catalogue-import/jobs/${encodeURIComponent(activeJob.id)}`,
        )
          .then((res) => {
            if (!cancelled) applyPreviewPayload(res)
          })
          .catch(() => {})
      }
      if (activeTab === 'HISTORY') {
        void loadJobs(true)
      }
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, activeTab, activeJob, jobs, applyPreviewPayload, loadJobs])

  function resetPreviewState() {
    setActiveJob(null)
    setPreviewDraft(null)
    setEditableDraft(null)
    setInlineEditMode(false)
    setDiffRows([])
    setSelectedFields(new Set())
    setUncertaintyFlags([])
    setMediaCandidates([])
    setHasUnsavedChanges(false)
    setDrawerError('')
  }

  function requestClose() {
    if (hasUnsavedChanges) {
      setConfirmCloseOpen(true)
    } else {
      resetPreviewState()
      onClose()
    }
  }

  function toggleDataGroup(id: ImportDataGroup) {
    setDataGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]))
  }

  async function runSyncCheckForTarget() {
    if (!targetModel) return
    setPreviewBusy(true)
    setDrawerError('')
    try {
      const res = await api<PreviewApiResponse>('/dashboard/catalogue-import/sync-check', {
        method: 'POST',
        timeoutMs: 35_000,
        body: JSON.stringify({
          targetModelId: targetModel.id,
          url: urlInput.trim() || undefined,
          dataGroups,
          conflictPolicy,
        }),
      })
      applyPreviewPayload(res)
      toast('Đã phân tích dữ liệu mới từ nguồn nhà sản xuất. Vui lòng kiểm tra trước khi lưu.')
    } catch (err) {
      setDrawerError((err as Error).message)
    } finally {
      setPreviewBusy(false)
    }
  }

  async function submitUrlPreview() {
    if (!urlInput.trim()) {
      setDrawerError('Vui lòng nhập URL chính thức (HTTPS) từ website nhà sản xuất.')
      return
    }
    if (
      initialMode === 'SYNC' &&
      targetModel &&
      urlInput.trim() === (targetModel.source ?? '').trim()
    ) {
      await runSyncCheckForTarget()
      return
    }
    setPreviewBusy(true)
    setDrawerError('')
    try {
      const res = await api<PreviewApiResponse>('/dashboard/catalogue-import/preview', {
        method: 'POST',
        timeoutMs: 35_000,
        body: JSON.stringify({
          method: 'URL',
          url: urlInput.trim(),
          dataGroups,
          conflictPolicy,
          ...(matchedModel?.id ? { targetModelId: matchedModel.id } : {}),
        }),
      })
      applyPreviewPayload(res)
      toast('Đã trích xuất dữ liệu xem trước từ website hãng.')
    } catch (err) {
      setDrawerError((err as Error).message)
    } finally {
      setPreviewBusy(false)
    }
  }

  async function submitAiSearchPreview() {
    if (!aiBrand.trim() || !aiModelName.trim()) {
      setDrawerError('Vui lòng nhập thương hiệu và tên dòng xe cần tìm kiếm.')
      return
    }
    setPreviewBusy(true)
    setDrawerError('')
    try {
      const res = await api<PreviewApiResponse>('/dashboard/catalogue-import/preview', {
        method: 'POST',
        timeoutMs: 35_000,
        body: JSON.stringify({
          method: 'AI_SEARCH',
          brand: aiBrand.trim(),
          modelName: aiModelName.trim(),
          modelYear: aiYear.trim() ? Number(aiYear.trim()) : undefined,
          variant: aiVariant.trim() || undefined,
          market: aiMarket.trim() || 'VN',
          query:
            `${aiBrand.trim()} ${aiModelName.trim()} ${aiYear.trim()} ${aiVariant.trim()} ${aiMarket.trim()}`.trim(),
          dataGroups,
          conflictPolicy,
          ...(matchedModel?.id ? { targetModelId: matchedModel.id } : {}),
        }),
      })
      applyPreviewPayload(res)
    } catch (err) {
      if (err instanceof RequestError && (err.code === 'AI_UNCONFIGURED' || err.status === 503)) {
        setAiAvailable(false)
        setAiNotice(err.message)
      }
      setDrawerError((err as Error).message)
    } finally {
      setPreviewBusy(false)
    }
  }

  async function submitBulkPreview() {
    if (!bulkText.trim()) {
      setDrawerError('Vui lòng nhập danh sách URL, tên xe hoặc nội dung CSV/NORI JSON.')
      return
    }
    setPreviewBusy(true)
    setDrawerError('')
    try {
      const lines = bulkText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)

      const payloadBody: Record<string, unknown> = {
        method: 'BULK',
        dataGroups,
        conflictPolicy,
      }
      if (bulkInputType === 'URLS') {
        payloadBody.urls = lines
      } else if (bulkInputType === 'MODELS') {
        payloadBody.modelNames = lines
      } else {
        const trimmed = bulkText.trim()
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            payloadBody.jsonPayload = JSON.parse(trimmed)
          } catch {
            setDrawerError('Nội dung JSON chưa hợp lệ. Vui lòng kiểm tra lại cú pháp.')
            setPreviewBusy(false)
            return
          }
        } else {
          payloadBody.csvText = bulkText
        }
      }

      const res = await api<PreviewApiResponse>('/dashboard/catalogue-import/preview', {
        method: 'POST',
        timeoutMs: 45_000,
        body: JSON.stringify(payloadBody),
      })
      applyPreviewPayload(res)
      toast('Đã xử lý danh sách nhập hàng loạt.')
    } catch (err) {
      setDrawerError((err as Error).message)
    } finally {
      setPreviewBusy(false)
    }
  }

  async function submitPdfPreview() {
    if (!pdfFile) {
      setDrawerError('Vui lòng chọn tệp Brochure PDF chính thức (tối đa 25 MB).')
      return
    }
    if (pdfFile.size > MAX_PDF_BYTES) {
      setDrawerError('Tệp PDF vượt quá giới hạn 25 MB.')
      return
    }
    setPreviewBusy(true)
    setDrawerError('')
    try {
      const fd = new FormData()
      fd.append('method', 'PDF_BROCHURE')
      fd.append('file', pdfFile)
      if (pdfBrand.trim()) fd.append('brand', pdfBrand.trim())
      if (pdfModelName.trim()) fd.append('modelName', pdfModelName.trim())
      if (pdfYear.trim()) fd.append('modelYear', pdfYear.trim())
      if (pdfSourceUrl.trim()) fd.append('url', pdfSourceUrl.trim())
      fd.append('conflictPolicy', conflictPolicy)
      fd.append('dataGroups', JSON.stringify(dataGroups))
      if (matchedModel?.id) fd.append('targetModelId', matchedModel.id)

      const response = await fetch('/nori-api/dashboard/catalogue-import/preview', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      })
      const json = (await response.json()) as {
        success?: boolean
        data?: PreviewApiResponse
        error?: { message?: string }
      }
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error?.message || 'Chưa thể phân tích tệp Brochure PDF.')
      }
      applyPreviewPayload(json.data)
      toast('Đã trích xuất thông số từ Brochure PDF. Vui lòng kiểm tra các mục Cần xác minh.')
    } catch (err) {
      setDrawerError((err as Error).message)
    } finally {
      setPreviewBusy(false)
    }
  }

  async function handleBulkFileUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setDrawerError('Tệp CSV/JSON vượt quá giới hạn 5 MB.')
      return
    }
    try {
      const content = await file.text()
      setBulkInputType('CSV_JSON')
      setBulkText(content)
      setDrawerError('')
      toast(`Đã nạp tệp ${file.name}. Nhấn "Phân tích danh sách" để xem trước.`)
    } catch {
      setDrawerError('Không thể đọc nội dung tệp đã chọn.')
    }
  }

  async function toggleFieldLock(field: string) {
    if (!matchedModel?.id) return
    setLockBusyField(field)
    const next = new Set(lockedFields)
    if (next.has(field)) next.delete(field)
    else next.add(field)
    try {
      const res = await api<{ lockedFields?: string[] }>(
        `/dashboard/catalogue-import/models/${encodeURIComponent(matchedModel.id)}/locks`,
        {
          method: 'PATCH',
          body: JSON.stringify({ lockedFields: Array.from(next) }),
        },
      )
      const confirmed = new Set(res.lockedFields ?? Array.from(next))
      setLockedFields(confirmed)
      if (confirmed.has(field)) {
        setSelectedFields((prev) => {
          const updated = new Set(prev)
          updated.delete(field)
          return updated
        })
      }
      toast(
        confirmed.has(field)
          ? `Đã khóa trường "${field}" khỏi ghi đè tự động.`
          : `Đã mở khóa trường "${field}".`,
      )
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLockBusyField(null)
    }
  }

  async function approveImport(mode: 'DRAFT' | 'VERIFIED_HIDDEN' | 'PUBLISH') {
    if (!activeJob?.id) return
    setApproveBusy(true)
    setDrawerError('')
    try {
      const draftOverrides: Record<string, unknown> = {}
      if (editableDraft) {
        if (editableDraft.name !== previewDraft?.name) draftOverrides.name = editableDraft.name
        if (editableDraft.officialName !== previewDraft?.officialName)
          draftOverrides.officialName = editableDraft.officialName
        if (editableDraft.modelYear !== previewDraft?.modelYear)
          draftOverrides.modelYear = editableDraft.modelYear
        if (editableDraft.shortDescription !== previewDraft?.shortDescription)
          draftOverrides.shortDescription = editableDraft.shortDescription
        if (editableDraft.description !== previewDraft?.description)
          draftOverrides.description = editableDraft.description
        if (editableDraft.source !== previewDraft?.source)
          draftOverrides.source = editableDraft.source
      }
      if (mode === 'DRAFT') {
        draftOverrides.verificationStatus = 'DRAFT'
        draftOverrides.visible = false
      } else if (mode === 'PUBLISH') {
        draftOverrides.verificationStatus = 'VERIFIED'
        draftOverrides.visible = true
      }

      const selectedMediaUrls = mediaCandidates
        .filter((m) => m.selected !== false)
        .map((m) => m.url)

      await api(`/dashboard/catalogue-import/jobs/${encodeURIComponent(activeJob.id)}/approve`, {
        method: 'POST',
        timeoutMs: 60_000,
        body: JSON.stringify({
          publishMode: mode,
          verificationStatus:
            mode === 'DRAFT' ? 'DRAFT' : mode === 'PUBLISH' ? 'VERIFIED' : undefined,
          visible: mode === 'DRAFT' ? false : mode === 'PUBLISH' ? true : undefined,
          selectedFields: diffRows.length > 0 ? Array.from(selectedFields) : undefined,
          overrides: Object.keys(draftOverrides).length > 0 ? draftOverrides : undefined,
          conflictPolicy,
          lockFields: Array.from(lockedFields),
          downloadMedia,
          selectedMediaUrls,
          ...(matchedModel?.id ? { targetModelId: matchedModel.id } : {}),
        }),
      })

      toast(
        mode === 'DRAFT'
          ? 'Đã lưu bản nháp dòng xe thành công.'
          : mode === 'PUBLISH'
            ? 'Đã nhập dữ liệu và xuất bản dòng xe lên Catalogue.'
            : 'Đã xác nhận nhập dữ liệu dòng xe vào Catalogue.',
      )
      setHasUnsavedChanges(false)
      resetPreviewState()
      onImported()
      onClose()
    } catch (err) {
      setDrawerError((err as Error).message)
    } finally {
      setApproveBusy(false)
    }
  }

  async function handleJobAction(jobId: string, action: 'cancel' | 'retry' | 'rollback') {
    setActionJobId(jobId)
    setDrawerError('')
    try {
      const res = await api<PreviewApiResponse>(
        `/dashboard/catalogue-import/jobs/${encodeURIComponent(jobId)}/${action}`,
        { method: 'POST', timeoutMs: 45_000 },
      )
      if (action === 'cancel') {
        toast('Đã hủy tiến trình nhập dữ liệu.')
        if (activeJob?.id === jobId) resetPreviewState()
      } else if (action === 'retry') {
        toast('Đã chạy lại tiến trình nhập dữ liệu.')
        if (res?.job) applyPreviewPayload(res)
      } else if (action === 'rollback') {
        toast('Đã khôi phục dòng xe về phiên bản trước khi nhập.')
        setRollbackTargetJob(null)
        onImported()
      }
      await loadJobs(true)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setActionJobId(null)
    }
  }

  async function inspectJob(jobId: string) {
    setPreviewBusy(true)
    setDrawerError('')
    try {
      const res = await api<PreviewApiResponse>(
        `/dashboard/catalogue-import/jobs/${encodeURIComponent(jobId)}`,
      )
      applyPreviewPayload(res)
      setActiveTab('URL')
    } catch (err) {
      setDrawerError((err as Error).message)
    } finally {
      setPreviewBusy(false)
    }
  }

  const shownDraft = inlineEditMode
    ? (editableDraft ?? previewDraft)
    : (previewDraft ?? editableDraft)
  const filteredPreviewSpecs = useMemo(() => {
    const raw = shownDraft?.specifications ?? []
    return raw.filter((s) => isSpecApplicable(s.label, shownDraft?.fuelType))
  }, [shownDraft])

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        title={
          targetModel
            ? `Đồng bộ & Nhập thông minh — ${targetModel.name}`
            : 'Nhập thông tin xe thông minh từ hãng'
        }
        wide
      >
        <div className="space-y-5">
          {/* Top Mode Tabs */}
          <div
            role="tablist"
            aria-label="Phương thức nhập thông tin xe"
            className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-line pb-px"
          >
            {(
              [
                ['URL', 'Nhập từ website hãng'],
                ['AI_SEARCH', 'Tìm kiếm thông minh'],
                ['BULK', 'Nhập hàng loạt'],
                ['PDF_BROCHURE', 'Nhập từ Brochure PDF'],
                ['MANUAL', 'Nhập thủ công'],
                ['HISTORY', 'Lịch sử nhập liệu'],
              ] as const
            ).map(([key, label]) => (
              <TabButton
                key={key}
                selected={activeTab === key}
                onClick={() => {
                  setDrawerError('')
                  setActiveTab(key)
                }}
                className="shrink-0 whitespace-nowrap px-3.5 py-2.5 text-caption font-semibold"
              >
                {label}
              </TabButton>
            ))}
          </div>

          {drawerError && <Notice tone="error">{drawerError}</Notice>}

          {/* Target Existing Model Context Banner */}
          {matchedModel && activeTab !== 'HISTORY' && activeTab !== 'MANUAL' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-brand/25 bg-brand-soft/60 px-4 py-3 text-small">
              <div>
                <Text className="font-semibold text-ink">
                  Đang đối chiếu với dòng xe hiện có: {matchedModel.name}
                </Text>
                <Text className="text-caption text-muted">
                  Các trường đã khóa ({lockedFields.size}) và giá thuê/đặt cọc xe thực tế luôn được
                  bảo vệ.
                </Text>
              </div>
              {!targetModel && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMatchedModel(null)
                    setLockedFields(new Set())
                  }}
                >
                  Tạo dòng xe mới
                </Button>
              )}
            </div>
          )}

          {/* METHOD 1: OFFICIAL URL IMPORT */}
          {activeTab === 'URL' && !shownDraft && (
            <div className="space-y-5">
              <div className="space-y-3 rounded-card border border-line bg-subtle/40 p-4">
                <Text className="text-small font-semibold text-ink">
                  Hãng xe được hỗ trợ (Thị trường Việt Nam)
                </Text>
                <div className="flex flex-wrap gap-1.5">
                  {SUPPORTED_BRANDS.map((b) => (
                    <Badge key={b.name} tone="muted">
                      {b.name} ({b.domain})
                    </Badge>
                  ))}
                </div>
                <Text className="text-micro text-muted">
                  Hệ thống chỉ kết nối HTTPS tới tên miền chính thức của nhà sản xuất. Nếu website
                  hãng chặn truy cập tự động (WAF/CAPTCHA), hãy dùng tab{' '}
                  <strong>Nhập từ Brochure PDF</strong> hoặc <strong>Nhập hàng loạt</strong>.
                </Text>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  id="smart-import-url"
                  label="URL trang thông số chính thức của hãng (HTTPS) *"
                  type="url"
                  placeholder="https://www.toyota.com.vn/fortuner"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  wrapperClassName="sm:col-span-2"
                />
                <Select
                  id="smart-import-policy"
                  label="Chính sách xung đột"
                  value={conflictPolicy}
                  onChange={(e) => setConflictPolicy(e.target.value as ConflictPolicy)}
                >
                  <option value="OVERWRITE_UNLOCKED">Cập nhật trường chưa khóa</option>
                  <option value="MERGE_EMPTY">Chỉ điền trường đang trống</option>
                  <option value="SKIP_EXISTING">Giữ nguyên nếu đã có</option>
                </Select>
              </div>

              <div className="space-y-3 rounded-card border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text className="text-small font-semibold text-ink">
                    Nhóm dữ liệu cần trích xuất ({dataGroups.length}/{ALL_DATA_GROUPS.length})
                  </Text>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDataGroups(ALL_DATA_GROUPS)}
                    >
                      Chọn tất cả
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDataGroups([])}>
                      Bỏ chọn
                    </Button>
                  </div>
                </div>
                <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-5">
                  {DATA_GROUP_OPTIONS.map((grp) => (
                    <Checkbox
                      key={grp.id}
                      id={`grp-${grp.id}`}
                      checked={dataGroups.includes(grp.id)}
                      onChange={() => toggleDataGroup(grp.id)}
                      label={grp.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                {targetModel && (
                  <Button
                    variant="secondary"
                    loading={previewBusy}
                    onClick={() => void runSyncCheckForTarget()}
                  >
                    <Icon name="refresh" className="size-4" />
                    Kiểm tra đồng bộ từ hãng
                  </Button>
                )}
                <Button loading={previewBusy} onClick={() => void submitUrlPreview()}>
                  <Icon name="globe" className="size-4" />
                  Phân tích & Xem trước
                </Button>
              </div>
            </div>
          )}

          {/* METHOD 2: AI SMART SEARCH */}
          {activeTab === 'AI_SEARCH' && !shownDraft && (
            <div className="space-y-5">
              {aiAvailable === false && (
                <Notice tone="info">
                  <strong>Tìm kiếm thông minh (AI) chưa được cấu hình trên máy chủ:</strong>{' '}
                  {aiNotice ||
                    'Máy chủ chưa kích hoạt khóa API tìm kiếm AI. NORI không tự bịa thông số xe — vui lòng chuyển sang Nhập từ website hãng (URL) hoặc Nhập từ Brochure PDF.'}
                </Notice>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Input
                  id="ai-brand"
                  label="Thương hiệu *"
                  placeholder="Toyota / Honda / VinFast"
                  value={aiBrand}
                  onChange={(e) => setAiBrand(e.target.value)}
                />
                <Input
                  id="ai-model"
                  label="Tên dòng xe *"
                  placeholder="Fortuner / CR-V / VF 8"
                  value={aiModelName}
                  onChange={(e) => setAiModelName(e.target.value)}
                />
                <Input
                  id="ai-year"
                  label="Năm sản xuất"
                  type="number"
                  min={1990}
                  max={2035}
                  placeholder="2025"
                  value={aiYear}
                  onChange={(e) => setAiYear(e.target.value)}
                />
                <Input
                  id="ai-variant"
                  label="Phiên bản"
                  placeholder="Legender / L / Plus"
                  value={aiVariant}
                  onChange={(e) => setAiVariant(e.target.value)}
                />
                <Input
                  id="ai-market"
                  label="Thị trường"
                  value={aiMarket}
                  onChange={(e) => setAiMarket(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setActiveTab('URL')}>
                    Dùng URL chính thức
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setActiveTab('PDF_BROCHURE')}
                  >
                    Tải Brochure PDF
                  </Button>
                </div>
                <Button
                  loading={previewBusy}
                  disabled={aiAvailable === false}
                  onClick={() => void submitAiSearchPreview()}
                >
                  <Icon name="sparkles" className="size-4" />
                  Tìm kiếm & Xem trước
                </Button>
              </div>
            </div>
          )}

          {/* METHOD 3: BULK IMPORT */}
          {activeTab === 'BULK' && !shownDraft && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['URLS', 'Danh sách URL hãng'],
                      ['MODELS', 'Danh sách tên dòng xe'],
                      ['CSV_JSON', 'CSV / NORI JSON'],
                    ] as const
                  ).map(([type, label]) => (
                    <Button
                      key={type}
                      size="sm"
                      variant={bulkInputType === type ? 'dark' : 'secondary'}
                      onClick={() => setBulkInputType(type)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-2 rounded-control border border-line bg-canvas px-3.5 py-2 text-caption font-semibold hover:border-brand">
                  <Icon name="upload" className="size-4" />
                  Tải tệp CSV / JSON
                  <input
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void handleBulkFileUpload(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>

              <Textarea
                id="bulk-import-input"
                label={
                  bulkInputType === 'URLS'
                    ? 'Danh sách URL chính thức (mỗi dòng 1 URL HTTPS)'
                    : bulkInputType === 'MODELS'
                      ? 'Danh sách dòng xe (ví dụ: Toyota | Fortuner | 2024)'
                      : 'Dán nội dung CSV hoặc NORI JSON'
                }
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  bulkInputType === 'URLS'
                    ? 'https://www.toyota.com.vn/fortuner\nhttps://www.mitsubishi-motors.com.vn/newxpander'
                    : bulkInputType === 'MODELS'
                      ? 'Toyota | Fortuner | 2024\nMitsubishi | Xpander | 2024'
                      : '[{"name":"Toyota Fortuner","brand":"Toyota","category":"CAR","modelYear":2024}]'
                }
              />

              <div className="flex justify-end">
                <Button loading={previewBusy} onClick={() => void submitBulkPreview()}>
                  <Icon name="sliders" className="size-4" />
                  Phân tích danh sách
                </Button>
              </div>

              {bulkItems.length > 0 && (
                <div className="space-y-3 rounded-card border border-line p-4">
                  <Heading as="h3" size="body" className="font-semibold">
                    Tiến trình từng dòng xe ({bulkItems.length} mục)
                  </Heading>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-caption">
                      <thead>
                        <tr className="border-b border-line text-muted">
                          <th className="py-2 pr-3 font-semibold">Nguồn / Dòng xe</th>
                          <th className="py-2 pr-3 font-semibold">Trạng thái</th>
                          <th className="py-2 pr-3 font-semibold">Chi tiết</th>
                          <th className="py-2 text-right font-semibold">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {bulkItems.map((item, idx) => (
                          <tr key={`${item.input}-${idx}`}>
                            <td className="py-2.5 pr-3 font-medium text-ink">
                              <div>{item.modelName || item.input}</div>
                              {item.sourceUrl && (
                                <div className="text-micro text-muted truncate max-w-xs">
                                  {item.sourceUrl}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 pr-3">
                              <Badge tone={jobTone(item.status)}>
                                {JOB_STATUS_LABELS[item.status] ?? item.status}
                              </Badge>
                            </td>
                            <td className="py-2.5 pr-3 text-muted">
                              {item.errorMessage || 'Sẵn sàng kiểm tra'}
                            </td>
                            <td className="py-2.5 text-right">
                              <div className="inline-flex gap-2">
                                {(item.jobId || item.draft) &&
                                  (item.status === 'PREVIEW_READY' ||
                                    item.status === 'AWAITING_APPROVAL') && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => {
                                        if (item.jobId) {
                                          void inspectJob(item.jobId)
                                        } else if (item.draft && activeJob) {
                                          applyPreviewPayload({
                                            job: activeJob,
                                            preview: item.draft,
                                            diff: item.diff ?? [],
                                            existingModelMatch: item.existingModelMatch ?? null,
                                            uncertaintyFlags: item.uncertaintyFlags ?? [],
                                            mediaCandidates:
                                              item.draft.mediaCandidates ??
                                              item.draft.gallery ??
                                              [],
                                          })
                                        }
                                      }}
                                    >
                                      Xem trước
                                    </Button>
                                  )}
                                {item.jobId && item.status === 'FAILED' && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    loading={actionJobId === item.jobId}
                                    onClick={() => void handleJobAction(item.jobId!, 'retry')}
                                  >
                                    Thử lại
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* METHOD 4: PDF BROCHURE */}
          {activeTab === 'PDF_BROCHURE' && !shownDraft && (
            <div className="space-y-5">
              <Notice tone="info">
                Khuyên dùng khi website hãng bật WAF/CAPTCHA. Chỉ tải lên Brochure/Catalogue PDF
                chính thức của nhà sản xuất (tối đa 25 MB). Các thông số chưa rõ độ tin cậy sẽ được
                gắn cờ <strong>Cần xác minh</strong> kèm số trang tham chiếu.
              </Notice>

              <div className="rounded-card border-2 border-dashed border-line bg-subtle/40 p-6 text-center">
                <Icon name="file" className="mx-auto mb-2 size-8 text-brand" />
                <Text className="text-small font-semibold text-ink">
                  {pdfFile
                    ? `${pdfFile.name} (${(pdfFile.size / (1024 * 1024)).toFixed(2)} MB)`
                    : 'Chọn tệp Brochure PDF chính thức'}
                </Text>
                <label className="mt-3 inline-flex min-h-control-sm cursor-pointer items-center gap-2 rounded-control bg-brand px-4 py-2 text-caption font-semibold text-inverse hover:bg-brand-hover">
                  <Icon name="upload" className="size-4" />
                  Chọn tệp PDF (≤ 25 MB)
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      if (f && f.size > MAX_PDF_BYTES) {
                        setDrawerError('Tệp PDF vượt quá giới hạn 25 MB.')
                        setPdfFile(null)
                      } else {
                        setDrawerError('')
                        setPdfFile(f)
                      }
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  id="pdf-brand"
                  label="Thương hiệu (tùy chọn)"
                  placeholder="Ford / VinFast / Mercedes-Benz"
                  value={pdfBrand}
                  onChange={(e) => setPdfBrand(e.target.value)}
                />
                <Input
                  id="pdf-model"
                  label="Tên dòng xe (tùy chọn)"
                  placeholder="Ranger Raptor / VF 8"
                  value={pdfModelName}
                  onChange={(e) => setPdfModelName(e.target.value)}
                />
                <Input
                  id="pdf-year"
                  label="Đời xe (tùy chọn)"
                  type="number"
                  min={1990}
                  max={2035}
                  value={pdfYear}
                  onChange={(e) => setPdfYear(e.target.value)}
                />
                <Input
                  id="pdf-source-url"
                  label="URL nguồn Brochure (nếu có)"
                  type="url"
                  placeholder="https://..."
                  value={pdfSourceUrl}
                  onChange={(e) => setPdfSourceUrl(e.target.value)}
                />
              </div>

              <div className="flex justify-end">
                <Button loading={previewBusy} onClick={() => void submitPdfPreview()}>
                  <Icon name="file" className="size-4" />
                  Trích xuất thông số PDF
                </Button>
              </div>
            </div>
          )}

          {/* METHOD 5: MANUAL FALLBACK */}
          {activeTab === 'MANUAL' && (
            <div className="space-y-4 rounded-card border border-line bg-subtle/40 p-6">
              <Heading as="h3" size="subtitle">
                Nhập thủ công trực tiếp trên trình chỉnh sửa NORI (10 Tabs)
              </Heading>
              <Text className="text-small text-muted">
                Dùng phương thức này khi bạn muốn tự nhập toàn bộ thông số, tải ảnh trực tiếp lên
                Media Library hoặc tinh chỉnh chi tiết từng phiên bản/màu sắc.
              </Text>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => {
                    onClose()
                    onSwitchToManual(editableDraft ?? previewDraft)
                  }}
                >
                  <Icon name="edit" className="size-4" />
                  Mở trình chỉnh sửa dòng xe thủ công
                </Button>
                <Button variant="secondary" onClick={() => setActiveTab('URL')}>
                  Quay lại nhập từ website hãng
                </Button>
              </div>
            </div>
          )}

          {/* PREVIEW BEFORE SAVE (MANDATORY FOR ALL IMPORT METHODS) */}
          {shownDraft && activeTab !== 'HISTORY' && activeTab !== 'MANUAL' && (
            <div className="space-y-5 border-t border-line pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">Xem trước trước khi lưu</Badge>
                    {activeJob && (
                      <Badge tone={jobTone(activeJob.status)}>
                        {JOB_STATUS_LABELS[activeJob.status] ?? activeJob.status}
                        {typeof activeJob.progressPct === 'number'
                          ? ` (${activeJob.progressPct}%)`
                          : ''}
                      </Badge>
                    )}
                    {shownDraft.verificationStatus === 'VERIFIED' ? (
                      <Badge tone="brand">Đã xác minh nguồn</Badge>
                    ) : (
                      <Badge tone="warning">Cần xác minh</Badge>
                    )}
                    {shownDraft.imageLicenseStatus && (
                      <Badge tone="muted">Bản quyền ảnh: {shownDraft.imageLicenseStatus}</Badge>
                    )}
                  </div>
                  <Heading as="h3" size="title" className="mt-2">
                    {shownDraft.officialName || shownDraft.name || 'Dòng xe trích xuất'}
                  </Heading>
                  <Text className="text-caption text-muted">
                    {[
                      shownDraft.brand,
                      shownDraft.subCategory
                        ? (subCategoryLabels[shownDraft.subCategory] ?? shownDraft.subCategory)
                        : shownDraft.category,
                      shownDraft.modelYear ? `Đời ${shownDraft.modelYear}` : null,
                      shownDraft.versionName ? `Phiên bản: ${shownDraft.versionName}` : null,
                      `Thị trường: ${shownDraft.market || 'VN'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setInlineEditMode((v) => !v)}
                  >
                    <Icon name="edit" className="size-4" />
                    {inlineEditMode ? 'Xong chỉnh sửa nhanh' : 'Chỉnh sửa'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      resetPreviewState()
                    }}
                  >
                    Chọn nguồn khác
                  </Button>
                </div>
              </div>

              {/* Source URL & Protection Notice */}
              <div className="grid gap-3 rounded-card border border-line bg-subtle/50 p-4 text-caption sm:grid-cols-2">
                <div>
                  <span className="text-micro text-muted">Nguồn dữ liệu chính thức</span>
                  <div className="mt-1 font-medium text-ink break-all">
                    {shownDraft.sourceUrl || shownDraft.importSourceUrl || shownDraft.source ? (
                      /^https:\/\//.test(
                        String(
                          shownDraft.sourceUrl || shownDraft.importSourceUrl || shownDraft.source,
                        ),
                      ) ? (
                        <ExternalLink
                          href={String(
                            shownDraft.sourceUrl || shownDraft.importSourceUrl || shownDraft.source,
                          )}
                          target="_blank"
                        >
                          {String(
                            shownDraft.sourceUrl || shownDraft.importSourceUrl || shownDraft.source,
                          )}
                        </ExternalLink>
                      ) : (
                        String(
                          shownDraft.sourceUrl || shownDraft.importSourceUrl || shownDraft.source,
                        )
                      )
                    ) : (
                      'Chưa có URL nguồn'
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-micro text-muted">Giá niêm yết tham khảo (MSRP)</span>
                  <div className="mt-1 font-semibold text-ink">
                    {formatMoney(shownDraft.msrpReferenceVnd ?? shownDraft.listedPrice ?? null)}
                    <span className="ml-2 font-normal text-muted">
                      (Không ghi đè giá thuê/đặt cọc xe thực tế NORI)
                    </span>
                  </div>
                </div>
              </div>

              {/* Missing Fields & Warnings */}
              {((shownDraft.missingFields?.length ?? 0) > 0 ||
                (shownDraft.warnings?.length ?? 0) > 0 ||
                uncertaintyFlags.length > 0) && (
                <div className="space-y-2 rounded-card border border-warning/30 bg-warning-soft p-4 text-small text-warning">
                  <div className="flex items-center gap-2 font-semibold">
                    <Icon name="alert" className="size-4 shrink-0" />
                    Lưu ý xác minh dữ liệu (
                    {uncertaintyFlags.length + (shownDraft.warnings?.length ?? 0)})
                  </div>
                  {(shownDraft.missingFields?.length ?? 0) > 0 && (
                    <Text className="text-caption">
                      <strong>Trường còn thiếu:</strong> {shownDraft.missingFields!.join(', ')}
                    </Text>
                  )}
                  {shownDraft.warnings?.map((w, i) => (
                    <Text key={`w-${i}`} className="text-caption">
                      • {w}
                    </Text>
                  ))}
                  {uncertaintyFlags.map((flag, i) => (
                    <Text key={`uf-${i}`} className="text-caption">
                      • {flag.label || flag.field ? `[${flag.label || flag.field}] ` : ''}
                      {flag.reason || flag.message || 'Cần kiểm tra lại giá trị'}
                      {flag.pageRef ? ` (Trang ${flag.pageRef})` : ''}
                      {flag.snippet || flag.evidenceSnippet
                        ? ` — “${flag.snippet || flag.evidenceSnippet}”`
                        : ''}
                    </Text>
                  ))}
                </div>
              )}

              {/* Inline Edit Mode */}
              {inlineEditMode && editableDraft && (
                <div className="space-y-4 rounded-card border border-brand/30 bg-canvas p-4">
                  <Heading as="h4" size="body" className="font-semibold">
                    Chỉnh sửa nhanh dữ liệu xem trước
                  </Heading>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      id="preview-edit-name"
                      label="Tên dòng xe"
                      value={editableDraft.name ?? ''}
                      onChange={(e) =>
                        setEditableDraft((prev) => ({ ...(prev ?? {}), name: e.target.value }))
                      }
                    />
                    <Input
                      id="preview-edit-official"
                      label="Tên thương mại chính thức"
                      value={editableDraft.officialName ?? ''}
                      onChange={(e) =>
                        setEditableDraft((prev) => ({
                          ...(prev ?? {}),
                          officialName: e.target.value,
                        }))
                      }
                    />
                    <Input
                      id="preview-edit-year"
                      label="Năm áp dụng"
                      type="number"
                      value={editableDraft.modelYear ?? ''}
                      onChange={(e) =>
                        setEditableDraft((prev) => ({
                          ...(prev ?? {}),
                          modelYear: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                    />
                  </div>
                  <Textarea
                    id="preview-edit-short"
                    label="Mô tả ngắn"
                    rows={2}
                    value={editableDraft.shortDescription ?? ''}
                    onChange={(e) =>
                      setEditableDraft((prev) => ({
                        ...(prev ?? {}),
                        shortDescription: e.target.value,
                      }))
                    }
                  />
                  <Textarea
                    id="preview-edit-desc"
                    label="Mô tả tổng quan"
                    rows={3}
                    value={editableDraft.description ?? ''}
                    onChange={(e) =>
                      setEditableDraft((prev) => ({
                        ...(prev ?? {}),
                        description: e.target.value,
                      }))
                    }
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setHasUnsavedChanges(false)
                        onClose()
                        onSwitchToManual(editableDraft)
                      }}
                    >
                      Mở trong trình chỉnh sửa 10 Tabs
                    </Button>
                  </div>
                </div>
              )}

              {/* Side-by-side Comparison Table for Existing Model Update / Sync */}
              {diffRows.length > 0 && (
                <div className="space-y-3 rounded-card border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Heading as="h4" size="body" className="font-semibold">
                      Bảng đối chiếu trường dữ liệu ({diffRows.length} trường)
                    </Heading>
                    <Text className="text-caption text-muted">
                      Đã chọn cập nhật {selectedFields.size} trường
                    </Text>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-caption">
                      <thead>
                        <tr className="border-b border-line text-muted">
                          <th className="py-2 pr-3 font-semibold">Trường dữ liệu</th>
                          <th className="py-2 pr-3 font-semibold">Giá trị hiện tại</th>
                          <th className="py-2 pr-3 font-semibold">Giá trị đề xuất</th>
                          <th className="py-2 pr-3 font-semibold">Nguồn</th>
                          <th className="py-2 pr-3 font-semibold">Khóa trường</th>
                          <th className="py-2 text-right font-semibold">Chọn cập nhật</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {diffRows.map((row) => {
                          const isLocked = row.locked || lockedFields.has(row.field)
                          const isProtected = Boolean(row.protectedField)
                          const isSelected = selectedFields.has(row.field)
                          return (
                            <tr key={row.field} className={isLocked ? 'bg-subtle/60' : undefined}>
                              <td className="py-2.5 pr-3 font-medium text-ink">
                                {row.label || row.field}
                              </td>
                              <td className="py-2.5 pr-3 text-muted max-w-44 truncate">
                                {formatFieldValue(row.currentValue)}
                              </td>
                              <td className="py-2.5 pr-3 font-medium text-ink max-w-48 truncate">
                                {formatFieldValue(row.proposedValue)}
                              </td>
                              <td className="py-2.5 pr-3 text-muted">
                                {row.source || shownDraft.brand || 'Nguồn hãng'}
                              </td>
                              <td className="py-2.5 pr-3">
                                {matchedModel?.id ? (
                                  <Button
                                    size="sm"
                                    variant={isLocked ? 'dark' : 'ghost'}
                                    loading={lockBusyField === row.field}
                                    onClick={() => void toggleFieldLock(row.field)}
                                  >
                                    <Icon name="lock" className="size-3.5" />
                                    {isLocked ? 'Đã khóa' : 'Khóa'}
                                  </Button>
                                ) : (
                                  <Badge tone="muted">{isLocked ? 'Khóa' : 'Mở'}</Badge>
                                )}
                              </td>
                              <td className="py-2.5 text-right">
                                <input
                                  type="checkbox"
                                  aria-label={`Chọn cập nhật ${row.label || row.field}`}
                                  disabled={isLocked || isProtected}
                                  checked={isSelected && !isLocked && !isProtected}
                                  onChange={(e) => {
                                    const checked = e.target.checked
                                    setSelectedFields((prev) => {
                                      const next = new Set(prev)
                                      if (checked) next.add(row.field)
                                      else next.delete(row.field)
                                      return next
                                    })
                                  }}
                                  className="size-4 rounded-sm border-line"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Extracted Gallery Preview */}
              {mediaCandidates.length > 0 && (
                <div className="space-y-3 rounded-card border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Heading as="h4" size="body" className="font-semibold">
                      Ảnh trích xuất xem trước ({mediaCandidates.length} ảnh)
                    </Heading>
                    <Checkbox
                      id="import-download-media"
                      checked={downloadMedia}
                      onChange={(e) => setDownloadMedia(e.target.checked)}
                      label="Tải về & tối ưu lưu trữ trên máy chủ NORI (khuyến nghị)"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {mediaCandidates.map((m, idx) => (
                      <div
                        key={`${m.url}-${idx}`}
                        className="rounded-control border border-line bg-subtle/40 p-2 space-y-2"
                      >
                        <div className="relative h-24 w-full overflow-hidden rounded-control bg-subtle">
                          {!brokenPreviewUrls.has(m.url) ? (
                            <Image
                              src={m.url}
                              alt={m.altText || `Ảnh xem trước ${idx + 1}`}
                              fill
                              sizes="200px"
                              className="object-cover"
                              onError={() =>
                                setBrokenPreviewUrls((prev) => new Set(prev).add(m.url))
                              }
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center p-2 text-center text-micro text-muted">
                              Ảnh hãng sẽ tải qua máy chủ khi xác nhận
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-micro">
                          <Badge tone="muted">{m.kind || 'EXTERIOR'}</Badge>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={m.selected !== false}
                              onChange={(e) =>
                                setMediaCandidates((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, selected: e.target.checked } : item,
                                  ),
                                )
                              }
                            />
                            <span>Chọn</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted Specifications Preview */}
              {filteredPreviewSpecs.length > 0 && (
                <div className="space-y-3 rounded-card border border-line p-4">
                  <Heading as="h4" size="body" className="font-semibold">
                    Thông số kỹ thuật trích xuất ({filteredPreviewSpecs.length} thông số)
                  </Heading>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full border-collapse text-left text-caption">
                      <thead>
                        <tr className="border-b border-line text-muted">
                          <th className="py-2 pr-3 font-semibold">Nhóm</th>
                          <th className="py-2 pr-3 font-semibold">Thông số</th>
                          <th className="py-2 pr-3 font-semibold">Giá trị</th>
                          <th className="py-2 font-semibold">Tham chiếu / Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {filteredPreviewSpecs.map((spec, idx) => (
                          <tr key={`${spec.label}-${idx}`}>
                            <td className="py-2 pr-3 text-muted">{spec.group}</td>
                            <td className="py-2 pr-3 font-medium text-ink">{spec.label}</td>
                            <td className="py-2 pr-3 text-ink">{spec.value}</td>
                            <td className="py-2 text-muted">
                              {spec.unverified && (
                                <Badge tone="warning" className="mr-1.5">
                                  Cần xác minh
                                </Badge>
                              )}
                              {spec.pageRef ? `Trang ${spec.pageRef}` : spec.source || 'Nguồn hãng'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Mandatory Confirmation Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" disabled={approveBusy} onClick={requestClose}>
                    Hủy
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={approveBusy}
                    onClick={() => setInlineEditMode((v) => !v)}
                  >
                    Chỉnh sửa
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    loading={approveBusy}
                    onClick={() => void approveImport('DRAFT')}
                  >
                    Lưu bản nháp
                  </Button>
                  <Button
                    variant="dark"
                    loading={approveBusy}
                    onClick={() => void approveImport('VERIFIED_HIDDEN')}
                  >
                    Xác nhận nhập dữ liệu
                  </Button>
                  <Button
                    variant="primary"
                    loading={approveBusy}
                    onClick={() => void approveImport('PUBLISH')}
                  >
                    Lưu & Xuất bản
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: IMPORT JOB HISTORY & ROLLBACK */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Select
                  id="import-history-status"
                  label="Lọc theo trạng thái"
                  value={jobsStatusFilter}
                  onChange={(e) => {
                    setJobsPage(1)
                    setJobsStatusFilter(e.target.value)
                  }}
                  wrapperClassName="w-full sm:w-64"
                >
                  <option value="">Tất cả trạng thái</option>
                  {Object.entries(JOB_STATUS_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="secondary" onClick={() => void loadJobs()}>
                  <Icon name="refresh" className="size-4" />
                  Làm mới
                </Button>
              </div>

              {jobsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : jobs.length === 0 ? (
                <EmptyState
                  icon="clock"
                  title="Chưa có lịch sử nhập liệu"
                  description="Các tiến trình nhập từ website hãng, Brochure PDF hoặc nhập hàng loạt sẽ được lưu vết tại đây."
                />
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => {
                    const isActive = ACTIVE_JOB_STATUSES.has(job.status)
                    const canPreview =
                      job.status === 'PREVIEW_READY' || job.status === 'AWAITING_APPROVAL'
                    const canCancel = isActive || canPreview
                    const canRetry =
                      job.status === 'FAILED' ||
                      job.status === 'CANCELLED' ||
                      job.status === 'PARTIAL_SUCCESS'
                    const canRollback =
                      (job.status === 'COMPLETED' || job.status === 'PARTIAL_SUCCESS') &&
                      Boolean(job.canRollback || job.hasRollbackSnapshot || job.rollbackSnapshot)

                    return (
                      <div
                        key={job.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line p-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">{job.jobCode || job.id}</span>
                            <Badge tone="muted">{job.method}</Badge>
                            <Badge tone={jobTone(job.status)}>
                              {JOB_STATUS_LABELS[job.status] ?? job.status}
                              {typeof job.progressPct === 'number' && isActive
                                ? ` · ${job.progressPct}%`
                                : ''}
                            </Badge>
                          </div>
                          <Text className="text-caption text-muted">
                            {job.targetModelName || job.normalizedDraft?.name || 'Dòng xe mới'}
                            {job.currentStage ? ` · ${job.currentStage}` : ''}
                            {job.createdAt ? ` · ${formatDate(job.createdAt)}` : ''}
                          </Text>
                          {job.errorMessage && (
                            <Text className="text-caption text-danger">{job.errorMessage}</Text>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canPreview && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => void inspectJob(job.id)}
                            >
                              Xem trước & Duyệt
                            </Button>
                          )}
                          {canRetry && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={actionJobId === job.id}
                              onClick={() => void handleJobAction(job.id, 'retry')}
                            >
                              Thử lại
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              size="sm"
                              variant="danger"
                              loading={actionJobId === job.id}
                              onClick={() => void handleJobAction(job.id, 'cancel')}
                            >
                              Hủy tiến trình
                            </Button>
                          )}
                          {canRollback && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setRollbackTargetJob(job)}
                            >
                              Khôi phục phiên bản trước
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {jobsTotalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <Text className="text-caption text-muted">
                        Trang {jobsPage} / {jobsTotalPages}
                      </Text>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={jobsPage <= 1}
                          onClick={() => setJobsPage((p) => Math.max(1, p - 1))}
                        >
                          Trang trước
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={jobsPage >= jobsTotalPages}
                          onClick={() => setJobsPage((p) => Math.min(jobsTotalPages, p + 1))}
                        >
                          Trang sau
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>

      {/* Inline Unsaved Changes Confirmation */}
      <Dialog
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        title="Đóng trình nhập thông minh?"
      >
        <div className="space-y-4">
          <Text className="text-small text-muted">
            Bạn đang có dữ liệu xem trước hoặc chỉnh sửa chưa lưu. Nếu đóng ngay bây giờ, thay đổi
            chưa xác nhận sẽ bị bỏ qua.
          </Text>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmCloseOpen(false)}>
              Tiếp tục xem trước
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmCloseOpen(false)
                resetPreviewState()
                onClose()
              }}
            >
              Bỏ thay đổi & Đóng
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Rollback Confirmation */}
      <Dialog
        open={Boolean(rollbackTargetJob)}
        onClose={() => setRollbackTargetJob(null)}
        title="Khôi phục phiên bản trước khi nhập?"
      >
        {rollbackTargetJob && (
          <div className="space-y-4">
            <Text className="text-small text-muted">
              Khôi phục dữ liệu dòng xe về ảnh chụp trước tiến trình{' '}
              <strong>{rollbackTargetJob.jobCode || rollbackTargetJob.id}</strong>? Thao tác này sẽ
              ghi nhận vào nhật ký kiểm toán và làm mới cache công khai.
            </Text>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setRollbackTargetJob(null)}>
                Hủy
              </Button>
              <Button
                variant="danger"
                loading={actionJobId === rollbackTargetJob.id}
                onClick={() => void handleJobAction(rollbackTargetJob.id, 'rollback')}
              >
                Xác nhận khôi phục
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}

import crypto from 'node:crypto'
import { APIError, type Payload } from 'payload'
import { recordAudit } from '../../hooks/audit-nori.ts'
import type { Admin, VehicleModel } from '@/payload-types'
import { resolveAdapterForUrl } from './adapters/registry.ts'
import { runSmartVehicleSearch } from './ai-search.ts'
import {
  extractBaseFromHtmlSignals,
  extractFromPdfBuffer,
  extractHtmlSignals,
} from './extractor.ts'
import { safeFetchUrl } from './fetcher.ts'
import { assertJobNotCancelled, createImportJob, transitionImportJob } from './job-manager.ts'
import { processAndUploadMediaCandidates } from './media-processor.ts'
import { normalizeVehicleDraft } from './normalizer.ts'
import { detectPdfMagicBytes, MAX_PDF_BYTES, stripHtmlAndXss } from './security.ts'
import type {
  BulkItemPreview,
  ConflictPolicy,
  ExistingModelMatch,
  ExtractedVehicleRaw,
  FieldDiffItem,
  ImportDataGroup,
  ImportMethod,
  MediaImportReportItem,
  NormalizedVehicleDraft,
} from './types.ts'

const FIELD_LABELS: Record<string, string> = {
  name: 'Tên dòng xe',
  officialName: 'Tên thương mại chính thức',
  brand: 'Thương hiệu',
  modelLine: 'Dòng sản phẩm',
  versionName: 'Phiên bản tiêu chuẩn',
  generation: 'Thế hệ',
  category: 'Danh mục',
  subCategory: 'Phân loại kiểu dáng',
  bodyStyle: 'Kiểu dáng',
  segment: 'Phân khúc',
  origin: 'Xuất xứ',
  modelYear: 'Đời xe',
  seats: 'Số chỗ ngồi',
  fuelType: 'Nhiên liệu / Năng lượng',
  transmission: 'Hộp số',
  driveType: 'Hệ dẫn động',
  msrpReferenceVnd: 'Giá niêm yết hãng (VNĐ)',
  listedPrice: 'Giá niêm yết tham khảo (VNĐ)',
  shortDescription: 'Mô tả ngắn',
  description: 'Giới thiệu tổng quan',
  exteriorOverview: 'Mô tả ngoại thất',
  interiorOverview: 'Mô tả nội thất',
  engineOverview: 'Mô tả động cơ & vận hành',
  highlights: 'Đặc điểm nổi bật',
  features: 'Trang bị tiện nghi & an toàn',
  specifications: 'Bảng thông số kỹ thuật',
  variants: 'Phiên bản & màu sắc',
  source: 'Nguồn catalogue',
  importSourceUrl: 'URL nguồn chính thức',
}

async function safeInvalidateCatalogueCaches(slugs: string[]): Promise<void> {
  try {
    const { invalidateNoriCaches } = await import('../public-cache.ts')
    invalidateNoriCaches({ slugs: slugs.filter(Boolean), allDetails: true })
  } catch {
    // Safe outside Next request scope (e.g., CLI or node --test)
  }
}

const COMPARE_FIELDS = Object.keys(FIELD_LABELS)

function readLockedFields(doc: Record<string, unknown> | null | undefined): string[] {
  if (!doc) return []
  const raw = doc.lockedFields
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map((x) => String(x)).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

function isEmptyFieldValue(val: unknown): boolean {
  if (val === null || val === undefined || val === '') return true
  if (Array.isArray(val) && val.length === 0) return true
  return false
}

export function buildFieldDiffPreview(params: {
  existing: Record<string, unknown> | null
  draft: NormalizedVehicleDraft
  conflictPolicy: ConflictPolicy
}): FieldDiffItem[] {
  const lockedSet = new Set(readLockedFields(params.existing))
  const diffs: FieldDiffItem[] = []

  for (const field of COMPARE_FIELDS) {
    const currentValue = params.existing ? (params.existing[field] ?? null) : null
    const proposedValue = (params.draft as unknown as Record<string, unknown>)[field] ?? null
    if (isEmptyFieldValue(proposedValue) && isEmptyFieldValue(currentValue)) continue

    const changed = JSON.stringify(currentValue ?? null) !== JSON.stringify(proposedValue ?? null)
    const locked = lockedSet.has(field)

    let selected = false
    if (!isEmptyFieldValue(proposedValue) && changed && !locked) {
      if (!params.existing) {
        selected = true
      } else if (params.conflictPolicy === 'OVERWRITE_UNLOCKED') {
        selected = true
      } else if (params.conflictPolicy === 'MERGE_EMPTY') {
        selected = isEmptyFieldValue(currentValue)
      } else if (params.conflictPolicy === 'SKIP_EXISTING') {
        selected = false
      }
    }

    diffs.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      currentValue,
      proposedValue,
      changed,
      locked,
      selected,
      source: params.draft.source,
      confidence:
        field === 'specifications' && params.draft.uncertaintyFlags.length > 0 ? 'MEDIUM' : 'HIGH',
    })
  }

  return diffs
}

async function findMatchingModel(params: {
  payload: Payload
  user: Admin & { collection: 'admins' }
  targetModelId?: string | null
  slug?: string
}): Promise<Record<string, unknown> | null> {
  if (params.targetModelId) {
    try {
      const byId = await params.payload.findByID({
        collection: 'vehicle-models',
        id: params.targetModelId,
        user: params.user,
        overrideAccess: false,
        depth: 0,
      })
      return byId as unknown as Record<string, unknown>
    } catch {
      return null
    }
  }
  if (params.slug) {
    const bySlug = await params.payload.find({
      collection: 'vehicle-models',
      user: params.user,
      overrideAccess: false,
      depth: 0,
      limit: 1,
      where: { slug: { equals: params.slug } },
    })
    if (bySlug.docs[0]) {
      return bySlug.docs[0] as unknown as Record<string, unknown>
    }
  }
  return null
}

function toExistingModelMatch(doc: Record<string, unknown> | null): ExistingModelMatch | null {
  if (!doc) return null
  return {
    id: String(doc.id),
    slug: String(doc.slug ?? ''),
    name: String(doc.name ?? ''),
    brand: String(doc.brand ?? ''),
    verificationStatus: String(doc.verificationStatus ?? 'VERIFIED'),
    visible: Boolean(doc.visible),
    revisionNumber: Number(doc.revisionNumber ?? 1),
    lockedFields: readLockedFields(doc),
    lastImportedAt: typeof doc.lastImportedAt === 'string' ? doc.lastImportedAt : null,
  }
}

function parseCsvRows(csvText: string): Record<string, string>[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []

  const splitCsvLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    out.push(cur.trim())
    return out
  }

  const headers = splitCsvLine(lines[0]!).map((h) => h.replace(/^\uFEFF/, '').trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < Math.min(lines.length, 51); i += 1) {
    const vals = splitCsvLine(lines[i]!)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      if (h) row[h] = vals[idx] ?? ''
    })
    rows.push(row)
  }
  return rows
}

export async function runVehicleImportPreview(params: {
  payload: Payload
  user: Admin & { collection: 'admins' }
  method: ImportMethod
  targetModelId?: string | null
  conflictPolicy?: ConflictPolicy
  dataGroups?: ImportDataGroup[]
  url?: string
  urls?: string[]
  query?: string
  brand?: string
  modelName?: string
  modelYear?: number
  variant?: string
  market?: string
  modelNames?: string[]
  csvText?: string
  jsonPayload?: unknown
  pdfBuffer?: Buffer
  pdfFileName?: string
  skipDnsCheck?: boolean
  fetchImpl?: typeof fetch
}) {
  const conflictPolicy: ConflictPolicy = params.conflictPolicy ?? 'MERGE_EMPTY'
  const job = await createImportJob({
    payload: params.payload,
    user: params.user,
    method: params.method,
    conflictPolicy,
    targetModelId: params.targetModelId,
    sourceInput: {
      method: params.method,
      url: params.url,
      urlsCount: params.urls?.length,
      query: params.query,
      brand: params.brand,
      modelName: params.modelName,
      modelYear: params.modelYear,
      variant: params.variant,
      market: params.market,
      pdfFileName: params.pdfFileName,
      dataGroups: params.dataGroups,
    },
  })
  const jobId = String(job.id)

  try {
    let rawExtracted: ExtractedVehicleRaw | null = null
    let bulkItems: BulkItemPreview[] | undefined

    await transitionImportJob({
      payload: params.payload,
      user: params.user,
      jobId,
      toStatus: 'FETCHING',
      progressPct: 20,
      currentStage: 'Đang kiểm tra bảo mật & tải dữ liệu nguồn',
    })

    if (params.method === 'URL') {
      if (!params.url) {
        throw new APIError('Vui lòng nhập URL trang xe chính thức của hãng.', 400)
      }
      const fetched = await safeFetchUrl(params.url, {
        kind: 'html',
        skipDnsCheck: params.skipDnsCheck,
        fetchImpl: params.fetchImpl,
      })
      await assertJobNotCancelled(params.payload, params.user, jobId)
      await transitionImportJob({
        payload: params.payload,
        user: params.user,
        jobId,
        toStatus: 'EXTRACTING',
        progressPct: 45,
        currentStage: 'Đang phân tích cấu trúc HTML, JSON-LD & thông số hãng',
      })
      const signals = extractHtmlSignals(fetched.text ?? '', fetched.finalUrl)
      const base = extractBaseFromHtmlSignals(signals, fetched.finalUrl)
      const adapter = resolveAdapterForUrl(fetched.finalUrl)
      rawExtracted = adapter.extract({
        url: fetched.finalUrl,
        html: fetched.text ?? '',
        signals,
        base,
      })
    } else if (params.method === 'PDF_BROCHURE') {
      if (!params.pdfBuffer || params.pdfBuffer.length === 0) {
        throw new APIError('Vui lòng tải lên tệp Brochure PDF chính thức.', 400)
      }
      if (params.pdfBuffer.length > MAX_PDF_BYTES) {
        throw new APIError('Kích thước tệp PDF vượt quá giới hạn 25 MB.', 413)
      }
      if (!detectPdfMagicBytes(params.pdfBuffer)) {
        throw new APIError('Tệp tải lên không phải PDF hợp lệ (sai chữ ký %PDF-).', 400)
      }
      await transitionImportJob({
        payload: params.payload,
        user: params.user,
        jobId,
        toStatus: 'EXTRACTING',
        progressPct: 50,
        currentStage: 'Đang đọc văn bản & bảng thông số từ Brochure PDF',
      })
      const parsed = extractFromPdfBuffer(
        params.pdfBuffer,
        params.pdfFileName || 'brochure.pdf',
        params.url,
      )
      rawExtracted = parsed.extracted
    } else if (params.method === 'AI_SEARCH') {
      await transitionImportJob({
        payload: params.payload,
        user: params.user,
        jobId,
        toStatus: 'EXTRACTING',
        progressPct: 45,
        currentStage: 'Đang tìm kiếm thông tin chính thức có kiểm chứng',
      })
      const aiRes = await runSmartVehicleSearch({
        query: params.query,
        brand: params.brand,
        modelName: params.modelName,
        modelYear: params.modelYear,
        variant: params.variant,
        market: params.market,
        officialUrl: params.url,
      })
      if (!aiRes.ok || !aiRes.extracted) {
        throw new APIError(
          aiRes.message || 'Tìm kiếm thông minh không tìm thấy nguồn dữ liệu xác thực.',
          aiRes.code === 'AI_SEARCH_UNCONFIGURED' ? 503 : 422,
          { code: aiRes.code ?? 'AI_SEARCH_UNAVAILABLE' },
        )
      }
      rawExtracted = aiRes.extracted
    } else if (params.method === 'BULK') {
      await transitionImportJob({
        payload: params.payload,
        user: params.user,
        jobId,
        toStatus: 'EXTRACTING',
        progressPct: 45,
        currentStage: 'Đang phân tích danh sách nhập hàng loạt',
      })
      bulkItems = []

      if (Array.isArray(params.urls) && params.urls.length > 0) {
        const sliced = params.urls.slice(0, 20)
        for (let i = 0; i < sliced.length; i += 1) {
          const itemUrl = sliced[i]!.trim()
          try {
            const fetched = await safeFetchUrl(itemUrl, {
              kind: 'html',
              skipDnsCheck: params.skipDnsCheck,
              fetchImpl: params.fetchImpl,
            })
            const signals = extractHtmlSignals(fetched.text ?? '', fetched.finalUrl)
            const base = extractBaseFromHtmlSignals(signals, fetched.finalUrl)
            const adapter = resolveAdapterForUrl(fetched.finalUrl)
            const ext = adapter.extract({
              url: fetched.finalUrl,
              html: fetched.text ?? '',
              signals,
              base,
            })
            const draft = normalizeVehicleDraft(ext, { dataGroups: params.dataGroups })
            const match = await findMatchingModel({
              payload: params.payload,
              user: params.user,
              slug: draft.slug,
            })
            bulkItems.push({
              index: i,
              input: itemUrl,
              inputType: 'URL',
              status: 'PREVIEW_READY',
              brand: draft.brand,
              modelName: draft.name,
              slug: draft.slug,
              draft,
              diff: buildFieldDiffPreview({ existing: match, draft, conflictPolicy }),
              existingModelMatch: toExistingModelMatch(match),
              uncertaintyFlags: draft.uncertaintyFlags,
            })
          } catch (itemErr) {
            bulkItems.push({
              index: i,
              input: itemUrl,
              inputType: 'URL',
              status: 'FAILED',
              errorCode:
                itemErr && typeof itemErr === 'object' && 'code' in itemErr
                  ? String((itemErr as { code: unknown }).code)
                  : 'ITEM_FAILED',
              errorMessage:
                itemErr instanceof Error ? itemErr.message : 'Không thể xử lý mục URL này.',
            })
          }
        }
      } else if (params.csvText && params.csvText.trim()) {
        const rows = parseCsvRows(params.csvText)
        for (let i = 0; i < rows.length; i += 1) {
          const r = rows[i]!
          const rowName = stripHtmlAndXss(r.name || r.model || '', 120)
          const rowBrand = stripHtmlAndXss(r.brand || '', 80)
          if (!rowName || !rowBrand) {
            bulkItems.push({
              index: i,
              input: JSON.stringify(r),
              inputType: 'CSV_ROW',
              status: 'FAILED',
              errorCode: 'MISSING_REQUIRED_COLUMNS',
              errorMessage: 'Dòng CSV thiếu cột brand hoặc name.',
            })
            continue
          }
          const draft = normalizeVehicleDraft({
            brand: rowBrand,
            name: rowName,
            officialName: r.officialName || rowName,
            category: (r.category as ExtractedVehicleRaw['category']) || 'CAR',
            subCategory: r.subCategory || undefined,
            modelYear: r.modelYear ? Number(r.modelYear) : undefined,
            seats: r.seats ? Number(r.seats) : undefined,
            fuelType: r.fuelType || undefined,
            transmission: r.transmission || undefined,
            msrpReferenceVnd: r.msrpReferenceVnd ? Number(r.msrpReferenceVnd) : undefined,
            shortDescription: r.shortDescription || undefined,
            sourceUrl: r.sourceUrl || undefined,
            sourceLabel: 'CSV Bulk Import',
            sourceType: 'BULK_FILE',
          })
          const match = await findMatchingModel({
            payload: params.payload,
            user: params.user,
            slug: draft.slug,
          })
          bulkItems.push({
            index: i,
            input: `${rowBrand} ${rowName}`,
            inputType: 'CSV_ROW',
            status: 'PREVIEW_READY',
            brand: draft.brand,
            modelName: draft.name,
            slug: draft.slug,
            draft,
            diff: buildFieldDiffPreview({ existing: match, draft, conflictPolicy }),
            existingModelMatch: toExistingModelMatch(match),
            uncertaintyFlags: draft.uncertaintyFlags,
          })
        }
      } else if (params.jsonPayload !== undefined) {
        const records = Array.isArray(params.jsonPayload)
          ? params.jsonPayload
          : [params.jsonPayload]
        for (let i = 0; i < Math.min(records.length, 50); i += 1) {
          const rec =
            records[i] && typeof records[i] === 'object'
              ? (records[i] as Record<string, unknown>)
              : {}
          const recName = stripHtmlAndXss(rec.name, 120)
          const recBrand = stripHtmlAndXss(rec.brand, 80)
          if (!recName || !recBrand) {
            bulkItems.push({
              index: i,
              input: `JSON[${i}]`,
              inputType: 'JSON_RECORD',
              status: 'FAILED',
              errorCode: 'INVALID_JSON_RECORD',
              errorMessage: 'Bản ghi JSON thiếu brand hoặc name.',
            })
            continue
          }
          const draft = normalizeVehicleDraft({
            ...(rec as ExtractedVehicleRaw),
            brand: recBrand,
            name: recName,
            sourceType: 'BULK_FILE',
            sourceLabel:
              typeof rec.source === 'string' && rec.source ? rec.source : 'NORI JSON Bulk Import',
          })
          const match = await findMatchingModel({
            payload: params.payload,
            user: params.user,
            slug: draft.slug,
          })
          bulkItems.push({
            index: i,
            input: `${recBrand} ${recName}`,
            inputType: 'JSON_RECORD',
            status: 'PREVIEW_READY',
            brand: draft.brand,
            modelName: draft.name,
            slug: draft.slug,
            draft,
            diff: buildFieldDiffPreview({ existing: match, draft, conflictPolicy }),
            existingModelMatch: toExistingModelMatch(match),
            uncertaintyFlags: draft.uncertaintyFlags,
          })
        }
      } else if (Array.isArray(params.modelNames) && params.modelNames.length > 0) {
        for (let i = 0; i < Math.min(params.modelNames.length, 25); i += 1) {
          const rawLine = stripHtmlAndXss(params.modelNames[i], 120)
          if (!rawLine) continue
          const parts = rawLine.split(/\s+/)
          const draft = normalizeVehicleDraft({
            brand: parts[0] || 'Chưa xác định',
            name: rawLine,
            sourceType: 'BULK_FILE',
            sourceLabel: 'Danh sách tên dòng xe (cần xác minh thông số)',
            uncertaintyFlags: [
              {
                field: 'specifications',
                reason: 'Khởi tạo từ danh sách tên mẫu xe; chưa có URL hoặc Brochure kiểm chứng.',
                severity: 'REVIEW',
              },
            ],
          })
          const match = await findMatchingModel({
            payload: params.payload,
            user: params.user,
            slug: draft.slug,
          })
          bulkItems.push({
            index: i,
            input: rawLine,
            inputType: 'MODEL_NAME',
            status: 'PREVIEW_READY',
            brand: draft.brand,
            modelName: draft.name,
            slug: draft.slug,
            draft,
            diff: buildFieldDiffPreview({ existing: match, draft, conflictPolicy }),
            existingModelMatch: toExistingModelMatch(match),
            uncertaintyFlags: draft.uncertaintyFlags,
          })
        }
      }

      if (!bulkItems || bulkItems.length === 0) {
        throw new APIError('Không có dữ liệu hợp lệ trong danh sách nhập hàng loạt.', 400)
      }
      const firstReady = bulkItems.find((b) => b.status === 'PREVIEW_READY' && b.draft)
      if (!firstReady?.draft) {
        throw new APIError(
          bulkItems[0]?.errorMessage || 'Tất cả mục nhập hàng loạt đều gặp lỗi.',
          422,
        )
      }
      rawExtracted = {
        brand: firstReady.draft.brand,
        name: firstReady.draft.name,
        category: firstReady.draft.category,
        sourceType: 'BULK_FILE',
        sourceLabel: `Bulk Import (${bulkItems.length} mục)`,
      }
    } else {
      throw new APIError('Phương thức nhập thủ công không sử dụng luồng trích xuất tự động.', 400)
    }

    await transitionImportJob({
      payload: params.payload,
      user: params.user,
      jobId,
      toStatus: 'NORMALIZING',
      progressPct: 70,
      currentStage: 'Đang chuẩn hóa dữ liệu theo phân loại xe & thị trường VN',
    })

    const primaryDraft =
      bulkItems?.find((b) => b.status === 'PREVIEW_READY' && b.draft)?.draft ??
      normalizeVehicleDraft(rawExtracted!, { dataGroups: params.dataGroups })

    await transitionImportJob({
      payload: params.payload,
      user: params.user,
      jobId,
      toStatus: 'VALIDATING',
      progressPct: 85,
      currentStage: 'Đang đối chiếu trùng lặp, trường khóa & tạo bản xem trước',
    })

    const existingDoc = await findMatchingModel({
      payload: params.payload,
      user: params.user,
      targetModelId: params.targetModelId,
      slug: primaryDraft.slug,
    })

    const diff = buildFieldDiffPreview({
      existing: existingDoc,
      draft: primaryDraft,
      conflictPolicy,
    })

    const updatedJob = await transitionImportJob({
      payload: params.payload,
      user: params.user,
      jobId,
      toStatus: 'AWAITING_APPROVAL',
      progressPct: 100,
      currentStage: 'Sẵn sàng xem trước & chờ quản trị viên phê duyệt',
      patch: {
        ...(existingDoc ? { targetModel: String(existingDoc.id) } : {}),
        normalizedDraft: bulkItems ? { primary: primaryDraft, bulkItems } : primaryDraft,
        diffPreview: diff,
        uncertaintyFlags: primaryDraft.uncertaintyFlags,
      },
    })

    return {
      job: updatedJob,
      preview: primaryDraft,
      diff,
      uncertaintyFlags: primaryDraft.uncertaintyFlags,
      existingModelMatch: toExistingModelMatch(existingDoc),
      mediaCandidates: primaryDraft.mediaCandidates,
      ...(bulkItems ? { bulkItems } : {}),
    }
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : err instanceof APIError && err.data && typeof err.data === 'object' && 'code' in err.data
          ? String((err.data as { code: unknown }).code)
          : 'PREVIEW_FAILED'
    const message = err instanceof Error ? err.message : 'Lỗi khi tạo bản xem trước dữ liệu xe.'
    await transitionImportJob({
      payload: params.payload,
      user: params.user,
      jobId,
      toStatus: 'FAILED',
      progressPct: 100,
      currentStage: 'Thất bại khi tạo bản xem trước',
      patch: {
        errorCode: code.slice(0, 80),
        errorMessage: message.slice(0, 1000),
      },
    }).catch(() => undefined)
    throw err
  }
}

export async function approveAndCommitImportJob(params: {
  payload: Payload
  user: Admin & { collection: 'admins' }
  jobId: string
  publishMode?: 'DRAFT' | 'VERIFIED_HIDDEN' | 'PUBLISH'
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'DRAFT'
  visible?: boolean
  selectedFields?: string[]
  overrides?: Record<string, unknown>
  conflictPolicy?: ConflictPolicy
  lockFields?: string[]
  downloadMedia?: boolean
  selectedMediaUrls?: string[]
  targetModelId?: string | null
  skipDnsCheck?: boolean
  fetchImpl?: typeof fetch
}) {
  const job = (await params.payload.findByID({
    collection: 'vehicle-import-jobs' as never,
    id: params.jobId,
    user: params.user,
    overrideAccess: false,
    depth: 0,
  })) as unknown as Record<string, unknown>

  const rawNormalized = job.normalizedDraft as
    | NormalizedVehicleDraft
    | { primary: NormalizedVehicleDraft; bulkItems?: BulkItemPreview[] }
    | null

  if (!rawNormalized) {
    throw new APIError('Tiến trình này chưa có dữ liệu xem trước để nhập.', 400)
  }

  const draft: NormalizedVehicleDraft =
    'primary' in rawNormalized ? rawNormalized.primary : rawNormalized

  await transitionImportJob({
    payload: params.payload,
    user: params.user,
    jobId: params.jobId,
    toStatus: 'IMPORTING',
    progressPct: 30,
    currentStage: 'Đang tạo snapshot rollback & xử lý dữ liệu',
  })

  const effectiveConflictPolicy: ConflictPolicy =
    params.conflictPolicy ?? (String(job.conflictPolicy ?? 'MERGE_EMPTY') as ConflictPolicy)

  try {
    const existingDoc = await findMatchingModel({
      payload: params.payload,
      user: params.user,
      targetModelId:
        params.targetModelId ?? (typeof job.targetModel === 'string' ? job.targetModel : null),
      slug: draft.slug,
    })

    // Save rollback snapshot BEFORE writing any changes to vehicle-models
    const rollbackSnapshot = existingDoc
      ? { existedBefore: true, modelId: String(existingDoc.id), doc: existingDoc }
      : { existedBefore: false, modelId: null, doc: null }

    const lockedSet = new Set([
      ...readLockedFields(existingDoc),
      ...(params.lockFields ?? []).map((f) => String(f)),
    ])

    // Media download + SHA-256 dedup + Payload Media upload
    let mediaReport: MediaImportReportItem[] = []
    let uploadedGallery: Awaited<
      ReturnType<typeof processAndUploadMediaCandidates>
    >['galleryItems'] = []
    let uploadedCoverId: string | null = null

    if (params.downloadMedia !== false && draft.mediaCandidates.length > 0) {
      const selectedUrlSet =
        Array.isArray(params.selectedMediaUrls) && params.selectedMediaUrls.length > 0
          ? new Set(params.selectedMediaUrls)
          : null
      const candidates = selectedUrlSet
        ? draft.mediaCandidates.filter((m) => selectedUrlSet.has(m.url))
        : draft.mediaCandidates

      const mediaRes = await processAndUploadMediaCandidates({
        payload: params.payload,
        user: params.user,
        candidates,
        modelName: draft.name,
        modelYear: draft.modelYear,
        skipDnsCheck: params.skipDnsCheck,
        fetchImpl: params.fetchImpl,
      })
      mediaReport = mediaRes.report
      uploadedGallery = mediaRes.galleryItems
      uploadedCoverId = mediaRes.coverId
    }

    const diff = buildFieldDiffPreview({
      existing: existingDoc,
      draft,
      conflictPolicy: effectiveConflictPolicy,
    })
    const selectedSet =
      Array.isArray(params.selectedFields) && params.selectedFields.length > 0
        ? new Set(params.selectedFields)
        : new Set(diff.filter((d) => d.selected).map((d) => d.field))

    const payloadData: Record<string, unknown> = {}
    const overrides = params.overrides ?? {}

    for (const item of diff) {
      if (item.locked) continue
      if (!existingDoc || selectedSet.has(item.field) || item.field in overrides) {
        const val = item.field in overrides ? overrides[item.field] : item.proposedValue
        if (val !== undefined) payloadData[item.field] = val
      }
    }

    // Required fields on create
    if (!existingDoc) {
      payloadData.name = payloadData.name ?? draft.name
      payloadData.brand = payloadData.brand ?? draft.brand
      payloadData.category = payloadData.category ?? draft.category
      payloadData.slug = draft.slug
    }

    // Never overwrite NORI internal rental pricing (`referenceRentPrice`, `defaultDepositSuggestion`) on existing models!
    delete payloadData.referenceRentPrice
    delete payloadData.defaultDepositSuggestion

    // Provenance, locks & revision metadata
    payloadData.importSourceUrl = draft.importSourceUrl
    payloadData.importSourceType = draft.importSourceType
    payloadData.importSourceHash = draft.importSourceHash
    payloadData.lastImportedAt = new Date().toISOString()
    payloadData.lockedFields = [...lockedSet]
    payloadData.revisionNumber = existingDoc ? Number(existingDoc.revisionNumber ?? 1) + 1 : 1

    if (uploadedCoverId && (!existingDoc?.cover || !lockedSet.has('cover'))) {
      payloadData.cover = uploadedCoverId
    }
    if (uploadedGallery.length > 0 && !lockedSet.has('gallery')) {
      payloadData.gallery = uploadedGallery
    }

    const publishMode = params.publishMode ?? 'VERIFIED_HIDDEN'
    if (params.verificationStatus) {
      payloadData.verificationStatus = params.verificationStatus
    } else if (publishMode === 'DRAFT') {
      payloadData.verificationStatus = 'DRAFT'
    } else {
      payloadData.verificationStatus = draft.verificationStatus
    }

    if (params.visible !== undefined) {
      payloadData.visible = Boolean(params.visible)
    } else {
      payloadData.visible = publishMode === 'PUBLISH'
    }

    let savedModel: VehicleModel
    const prevSlug = existingDoc ? String(existingDoc.slug ?? '') : ''

    if (existingDoc) {
      savedModel = (await params.payload.update({
        collection: 'vehicle-models',
        id: String(existingDoc.id),
        user: params.user,
        overrideAccess: false,
        data: payloadData as never,
      })) as VehicleModel
    } else {
      savedModel = (await params.payload.create({
        collection: 'vehicle-models',
        user: params.user,
        overrideAccess: false,
        data: payloadData as never,
      })) as VehicleModel
    }

    await safeInvalidateCatalogueCaches([prevSlug, savedModel.slug])

    await recordAudit(params.payload, params.user, {
      action: existingDoc ? 'vehicle-model.import_update' : 'vehicle-model.import_create',
      entity: 'vehicle-model',
      entityId: String(savedModel.id),
      entityLabel: savedModel.name,
      summary: `${existingDoc ? 'Đồng bộ' : 'Nhập mới'} dòng xe ${savedModel.name} qua ${String(job.method)} (Job ${String(job.jobCode)})`,
      fromStatus: existingDoc ? `rev-${String(existingDoc.revisionNumber ?? 1)}` : 'NEW',
      toStatus: `rev-${String(payloadData.revisionNumber)}`,
    })

    const hasMediaFailures = mediaReport.some((m) => m.status === 'FAILED')
    const finalStatus = hasMediaFailures ? 'PARTIAL_SUCCESS' : 'COMPLETED'

    const finishedJob = await transitionImportJob({
      payload: params.payload,
      user: params.user,
      jobId: params.jobId,
      toStatus: finalStatus,
      progressPct: 100,
      currentStage: hasMediaFailures
        ? 'Đã nhập dữ liệu xe (một số ảnh không tải được)'
        : 'Hoàn tất nhập dữ liệu dòng xe',
      patch: {
        targetModel: String(savedModel.id),
        mediaReport,
        rollbackSnapshot,
      },
    })

    return {
      job: finishedJob,
      model: {
        id: String(savedModel.id),
        slug: savedModel.slug,
        name: savedModel.name,
        verificationStatus: savedModel.verificationStatus,
        visible: Boolean(savedModel.visible),
        revisionNumber: Number(
          (savedModel as unknown as Record<string, unknown>).revisionNumber ?? 1,
        ),
      },
      mediaReport,
    }
  } catch (err) {
    await transitionImportJob({
      payload: params.payload,
      user: params.user,
      jobId: params.jobId,
      toStatus: 'FAILED',
      progressPct: 100,
      currentStage: 'Lỗi khi lưu dữ liệu vào Catalogue',
      patch: {
        errorCode: 'COMMIT_FAILED',
        errorMessage: err instanceof Error ? err.message.slice(0, 1000) : 'Lỗi không xác định.',
      },
    }).catch(() => undefined)
    throw err
  }
}

export async function rollbackImportJob(params: {
  payload: Payload
  user: Admin & { collection: 'admins' }
  jobId: string
}) {
  const job = (await params.payload.findByID({
    collection: 'vehicle-import-jobs' as never,
    id: params.jobId,
    user: params.user,
    overrideAccess: false,
    depth: 0,
  })) as unknown as Record<string, unknown>

  const snap = job.rollbackSnapshot as {
    existedBefore?: boolean
    modelId?: string | null
    doc?: Record<string, unknown> | null
    rolledBackAt?: string
  } | null

  if (!snap) {
    throw new APIError('Tiến trình này không có bản sao lưu Rollback.', 400)
  }
  if (snap.rolledBackAt) {
    throw new APIError('Tiến trình này đã được Rollback trước đó.', 409)
  }

  const targetModelId =
    snap.modelId ?? (typeof job.targetModel === 'string' ? job.targetModel : null)
  if (!targetModelId) {
    throw new APIError('Không xác định được dòng xe cần khôi phục.', 400)
  }

  if (snap.existedBefore && snap.doc) {
    const prev = snap.doc
    const arrayRestoreFields = new Set([
      'highlights',
      'features',
      'specifications',
      'variants',
      'lockedFields',
      'gallery',
    ])
    const restorePatch: Record<string, unknown> = {}
    for (const key of [
      ...COMPARE_FIELDS,
      'verificationStatus',
      'visible',
      'featured',
      'cover',
      'gallery',
      'importSourceUrl',
      'importSourceType',
      'importSourceHash',
      'lastImportedAt',
      'lockedFields',
      'revisionNumber',
    ]) {
      if (key in prev && prev[key] !== undefined) {
        restorePatch[key] = prev[key]
      } else if (arrayRestoreFields.has(key)) {
        restorePatch[key] = []
      } else if (key === 'revisionNumber') {
        restorePatch[key] = 1
      } else if (key === 'visible') {
        restorePatch[key] = true
      } else if (key === 'featured') {
        restorePatch[key] = false
      } else if (key === 'verificationStatus') {
        restorePatch[key] = 'VERIFIED'
      } else if (key === 'importSourceType') {
        restorePatch[key] = 'MANUAL'
      } else {
        restorePatch[key] = null
      }
    }
    const restored = (await params.payload.update({
      collection: 'vehicle-models',
      id: targetModelId,
      user: params.user,
      overrideAccess: false,
      data: restorePatch as never,
    })) as VehicleModel

    await safeInvalidateCatalogueCaches([restored.slug])
  } else {
    // Newly created by this job: check if vehicles were linked before deleting, else hide safely
    const linked = await params.payload.count({
      collection: 'vehicles',
      user: params.user,
      overrideAccess: false,
      where: { model: { equals: targetModelId } },
    })
    if (linked.totalDocs > 0) {
      await params.payload.update({
        collection: 'vehicle-models',
        id: targetModelId,
        user: params.user,
        overrideAccess: false,
        data: { visible: false, verificationStatus: 'DRAFT' } as never,
      })
    } else {
      await params.payload.delete({
        collection: 'vehicle-models',
        id: targetModelId,
        user: params.user,
        overrideAccess: false,
      })
    }
    await safeInvalidateCatalogueCaches([])
  }

  const rolledBackAt = new Date().toISOString()
  await params.payload.update({
    collection: 'vehicle-import-jobs' as never,
    id: params.jobId,
    user: params.user,
    overrideAccess: false,
    data: {
      currentStage: 'Đã khôi phục phiên bản trước (Rollback)',
      rollbackSnapshot: { ...snap, rolledBackAt },
    } as never,
  })

  await recordAudit(params.payload, params.user, {
    action: 'vehicle-model.import_rollback',
    entity: 'vehicle-import-job',
    entityId: params.jobId,
    entityLabel: String(job.jobCode ?? params.jobId),
    summary: `Khôi phục dữ liệu dòng xe trước khi nhập (Job ${String(job.jobCode ?? params.jobId)})`,
    fromStatus: String(job.status ?? 'COMPLETED'),
    toStatus: 'ROLLED_BACK',
  })

  return { ok: true, jobId: params.jobId, targetModelId, rolledBackAt }
}

export function hashDraftSummary(draft: NormalizedVehicleDraft): string {
  return crypto.createHash('sha256').update(JSON.stringify(draft)).digest('hex').slice(0, 16)
}

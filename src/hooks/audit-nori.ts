import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  Payload,
  PayloadRequest,
} from 'payload'
import { runBestEffortSafe } from '../lib/db-tx.ts'

type Actor =
  | {
      collection?: string
      id?: string | number
      email?: string | null
      adminRole?: string | null
      staffTitle?: string | null
    }
  | null
  | undefined

export type AuditEntry = {
  action: string
  entity: string
  entityId?: string | null
  entityLabel?: string | null
  summary: string
  fromStatus?: string | null
  toStatus?: string | null
  branchId?: string | null
  outcome?: 'SUCCESS' | 'DENIED' | 'FAILED'
}

/**
 * Writes one append-only audit entry. Failures are logged without leaking data and never
 * block the business operation that triggered them.
 */
export async function recordAudit(
  payload: Payload,
  actor: Actor,
  entry: AuditEntry,
  req?: PayloadRequest,
) {
  if (req?.context?.skipAudit) return
  const actorType =
    actor?.collection === 'admins' ? 'ADMIN' : actor?.collection === 'users' ? 'CUSTOMER' : 'SYSTEM'
  const actorRole =
    actor?.collection === 'admins'
      ? String(actor.staffTitle || actor.adminRole || 'OPERATOR')
      : actor?.collection === 'users'
        ? 'CUSTOMER'
        : 'SYSTEM'
  await runBestEffortSafe(
    payload,
    req,
    async () => {
      await payload.create({
        collection: 'audit-logs',
        overrideAccess: true,
        ...(req ? { req } : {}),
        data: {
          action: entry.action.slice(0, 80),
          entity: entry.entity.slice(0, 60),
          entityId: entry.entityId ? String(entry.entityId).slice(0, 120) : undefined,
          entityLabel: entry.entityLabel ? String(entry.entityLabel).slice(0, 200) : undefined,
          summary: entry.summary.slice(0, 500),
          fromStatus: entry.fromStatus ?? undefined,
          toStatus: entry.toStatus ?? undefined,
          actorType,
          actorId: actor?.id != null ? String(actor.id) : undefined,
          actorEmail: actor?.email ? String(actor.email) : undefined,
          actorRole,
          branchId: entry.branchId ? String(entry.branchId).slice(0, 60) : undefined,
          outcome: entry.outcome ?? 'SUCCESS',
        },
      })
    },
    (error) => {
      console.error(
        '[NORI] Audit log failed:',
        error instanceof Error ? error.name : 'UnknownError',
      )
    },
  )
}

const SENSITIVE_AUDIT_KEYS = new Set([
  'password',
  'hash',
  'salt',
  'token',
  'resetPasswordToken',
  'lockUntil',
  'loginAttempts',
  'driverLicenseNumber',
  'idCardNumber',
  'sessions',
])

function comparable(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((item) => {
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>
          if ('image' in rec) {
            const img = rec.image
            return typeof img === 'object' && img && 'id' in img ? (img as { id: unknown }).id : img
          }
          if ('desktopImage' in rec) {
            const dImg = rec.desktopImage
            return typeof dImg === 'object' && dImg && 'id' in dImg
              ? (dImg as { id: unknown }).id
              : dImg
          }
        }
        return item
      }),
    )
  }
  if (value && typeof value === 'object' && 'id' in value)
    return String((value as { id: unknown }).id)
  return JSON.stringify(value ?? null)
}

function formatSanitizedValue(key: string, value: unknown): string {
  if (SENSITIVE_AUDIT_KEYS.has(key)) return '[REDACTED]'
  if (value === null || value === undefined || value === '') return 'null'
  if (Array.isArray(value)) return `array(${value.length})`
  if (typeof value === 'object') {
    if ('filename' in value && typeof (value as { filename?: unknown }).filename === 'string') {
      return String((value as { filename: string }).filename)
    }
    if ('id' in value) return String((value as { id: unknown }).id)
    return 'object'
  }
  return String(value).slice(0, 60)
}

export function changedFieldSnapshots(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
  fields: Record<string, string>,
): { labels: string[]; fromSummary: string; toSummary: string } {
  const labels: string[] = []
  const fromParts: string[] = []
  const toParts: string[] = []
  for (const [key, label] of Object.entries(fields)) {
    if (SENSITIVE_AUDIT_KEYS.has(key)) continue
    if (comparable(previous?.[key]) !== comparable(next[key])) {
      labels.push(label)
      fromParts.push(`${key}=${formatSanitizedValue(key, previous?.[key])}`)
      toParts.push(`${key}=${formatSanitizedValue(key, next[key])}`)
    }
  }
  return {
    labels,
    fromSummary: fromParts.join('; ').slice(0, 240),
    toSummary: toParts.join('; ').slice(0, 240),
  }
}

export function changedFieldLabels(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
  fields: Record<string, string>,
): string[] {
  return changedFieldSnapshots(previous, next, fields).labels
}

type AuditOptions = {
  entity: string
  entityName: string
  label: (doc: Record<string, unknown>) => string
  fields?: Record<string, string>
  statusField?: string
  statusLabels?: Record<string, string>
  logCreate?: boolean
}

export function auditCollection(options: AuditOptions): {
  afterChange: CollectionAfterChangeHook
  afterDelete: CollectionAfterDeleteHook
} {
  const statusText = (value: unknown) =>
    value == null ? '—' : (options.statusLabels?.[String(value)] ?? String(value))
  return {
    afterChange: async ({ doc, previousDoc, operation, req }) => {
      if (req.context?.skipAudit) return doc
      const base = {
        entity: options.entity,
        entityId: String(doc.id),
        entityLabel: options.label(doc),
      }
      if (operation === 'create') {
        if (options.logCreate === false) return doc
        await recordAudit(
          req.payload,
          req.user,
          {
            ...base,
            action: `${options.entity}.create`,
            summary: `Tạo mới ${options.entityName} ${base.entityLabel}`,
            toStatus: options.statusField ? String(doc[options.statusField] ?? '') : undefined,
          },
          req,
        )
        return doc
      }
      if (options.statusField) {
        const before = previousDoc?.[options.statusField]
        const after = doc[options.statusField]
        if (before !== after) {
          await recordAudit(
            req.payload,
            req.user,
            {
              ...base,
              action: `${options.entity}.status`,
              summary: `${options.entityName} ${base.entityLabel}: ${statusText(before)} → ${statusText(after)}`,
              fromStatus: before == null ? undefined : String(before),
              toStatus: after == null ? undefined : String(after),
            },
            req,
          )
        }
      }
      const diff = changedFieldSnapshots(previousDoc, doc, options.fields ?? {})
      if (diff.labels.length) {
        await recordAudit(
          req.payload,
          req.user,
          {
            ...base,
            action: `${options.entity}.update`,
            summary: `Cập nhật ${options.entityName} ${base.entityLabel}: ${diff.labels.join(', ')}`,
            fromStatus: diff.fromSummary || undefined,
            toStatus: diff.toSummary || undefined,
          },
          req,
        )
      }
      return doc
    },
    afterDelete: async ({ doc, req }) => {
      await recordAudit(
        req.payload,
        req.user,
        {
          entity: options.entity,
          entityId: String(doc.id),
          entityLabel: options.label(doc),
          action: `${options.entity}.delete`,
          summary: `Xóa ${options.entityName} ${options.label(doc)}`,
        },
        req,
      )
      return doc
    },
  }
}

export const auditSiteContent: GlobalAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const fields: Record<string, string> = {
    siteName: 'Tên thương hiệu',
    tagline: 'Khẩu hiệu',
    logo: 'Logo',
    favicon: 'Favicon',
    ogImage: 'Ảnh OG',
    heroSlides: 'Hero Carousel',
    heroImages: 'Banner',
    storyImage: 'Ảnh câu chuyện',
    homeIntroTitle: 'Tiêu đề trang chủ',
    homeIntroDescription: 'Mô tả trang chủ',
    headerMenu: 'Menu Header',
    footerLinks: 'Liên kết Footer',
    aboutSummary: 'Giới thiệu',
    address: 'Địa chỉ',
    phone: 'Hotline',
    email: 'Email',
    openingHours: 'Giờ làm việc',
    contactNote: 'Nội dung liên hệ',
    rentalPolicySummary: 'Chính sách thuê',
    purchasePolicySummary: 'Chính sách mua',
    ageRequirement: 'Độ tuổi',
    licenseRequirement: 'Giấy phép lái xe',
    cancellationPolicy: 'Chính sách hủy',
    depositPolicy: 'Chính sách đặt cọc',
    termsOfUse: 'Điều khoản sử dụng',
    faqs: 'FAQ',
    maintenanceBannerEnabled: 'Banner bảo trì',
    maintenanceBannerText: 'Nội dung bảo trì',
  }
  const diff = changedFieldSnapshots(previousDoc, doc, fields)
  if (diff.labels.length)
    await recordAudit(
      req.payload,
      req.user,
      {
        action: 'content.update',
        entity: 'nori-site',
        entityLabel: 'Nội dung website',
        summary: `Cập nhật nội dung website: ${diff.labels.join(', ')}`,
        fromStatus: diff.fromSummary || undefined,
        toStatus: diff.toSummary || undefined,
      },
      req,
    )
  return doc
}

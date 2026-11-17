import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  Payload,
  PayloadRequest,
} from 'payload'

type Actor = { collection?: string; id?: string | number; email?: string | null } | null | undefined

export type AuditEntry = {
  action: string
  entity: string
  entityId?: string | null
  entityLabel?: string | null
  summary: string
  fromStatus?: string | null
  toStatus?: string | null
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
  try {
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
      },
    })
  } catch (error) {
    console.error('[NORI] Audit log failed:', error instanceof Error ? error.name : 'UnknownError')
  }
}

function comparable(value: unknown): string {
  if (Array.isArray(value)) return `array:${value.length}`
  if (value && typeof value === 'object' && 'id' in value)
    return String((value as { id: unknown }).id)
  return JSON.stringify(value ?? null)
}

export function changedFieldLabels(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
  fields: Record<string, string>,
): string[] {
  return Object.entries(fields)
    .filter(([key]) => comparable(previous?.[key]) !== comparable(next[key]))
    .map(([, label]) => label)
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
      const changed = changedFieldLabels(previousDoc, doc, options.fields ?? {})
      if (changed.length) {
        await recordAudit(
          req.payload,
          req.user,
          {
            ...base,
            action: `${options.entity}.update`,
            summary: `Cập nhật ${options.entityName} ${base.entityLabel}: ${changed.join(', ')}`,
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
    heroImages: 'Banner',
    storyImage: 'Ảnh câu chuyện',
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
  }
  const changed = changedFieldLabels(previousDoc, doc, fields)
  if (changed.length)
    await recordAudit(
      req.payload,
      req.user,
      {
        action: 'content.update',
        entity: 'nori-site',
        entityLabel: 'Nội dung website',
        summary: `Cập nhật nội dung website: ${changed.join(', ')}`,
      },
      req,
    )
  return doc
}

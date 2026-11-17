import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { isDepositExpired } from '@/lib/rental-rules'

const VALID_INQUIRY_STATUSES = [
  'NEW',
  'CONTACTED',
  'TEST_DRIVE_SCHEDULED',
  'DEPOSIT_PENDING',
  'CONTRACT_SIGNED',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
] as const

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const sp = new URL(request.url).searchParams
    const page = Math.max(1, Number(sp.get('page') || '1') || 1)
    const status = sp.get('status') || ''
    const inquiryType = sp.get('inquiryType') || ''
    const q = (sp.get('q') || '').trim().toLowerCase()

    if (
      status &&
      !VALID_INQUIRY_STATUSES.includes(status as (typeof VALID_INQUIRY_STATUSES)[number])
    ) {
      return fail('Bộ lọc trạng thái yêu cầu chưa hợp lệ.')
    }

    const res = await payload.find({
      collection: 'sales-inquiries',
      user,
      overrideAccess: false,
      depth: 1,
      limit: 500,
      sort: '-createdAt',
      ...(status ? { where: { status: { equals: status } } } : {}),
    })

    const filtered = res.docs
      .filter((inq) => {
        if (inquiryType && inq.inquiryType !== inquiryType) return false
        if (!q) return true
        const custName = typeof inq.customer === 'object' ? (inq.customer?.fullName ?? '') : ''
        const modelName = typeof inq.model === 'object' ? (inq.model?.name ?? '') : ''
        const hay =
          `${inq.reference ?? ''} ${custName} ${inq.phone} ${modelName} ${inq.vehicleReference ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .map((inq) => ({
        id: inq.id,
        reference: inq.reference ?? inq.id,
        inquiryType: inq.inquiryType ?? 'CONSULTATION',
        status: inq.status ?? 'NEW',
        customerName: typeof inq.customer === 'object' ? inq.customer?.fullName : 'Chưa cập nhật',
        customerEmail: typeof inq.customer === 'object' ? inq.customer?.email : undefined,
        phone: inq.phone,
        modelName: typeof inq.model === 'object' ? inq.model.name : 'Chưa cập nhật',
        modelSlug: typeof inq.model === 'object' ? inq.model.slug : '',
        vehicleReference: inq.vehicleReference ?? null,
        variantName: inq.variantName ?? null,
        colorName: inq.colorName ?? null,
        paymentMethod: inq.paymentMethod ?? null,
        preferredDate: inq.preferredDate ?? null,
        preferredLocation: inq.preferredLocation ?? null,
        quotedPriceSnapshot: inq.quotedPriceSnapshot ?? null,
        estimatedRollingSnapshot: inq.estimatedRollingSnapshot ?? null,
        note: inq.note ?? null,
        adminNote: inq.adminNote ?? null,
        statusHistory: (inq.statusHistory ?? []).map((h) => ({
          status: h.status,
          changedAt: h.changedAt,
          changedBy: h.changedBy ?? null,
          note: h.note ?? null,
        })),
        depositExpired: isDepositExpired(inq.createdAt, inq.status ?? 'NEW'),
        createdAt: inq.createdAt,
      }))

    const pageSize = 15
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    const safePage = Math.min(page, totalPages)

    return json({
      items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
      totalDocs: filtered.length,
      page: safePage,
      totalPages,
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, ['id', 'status', 'adminNote'])
    const id = text(data.id, 100)
    const status = text(data.status, 30)
    if (!id) return fail('Thiếu mã yêu cầu.')
    if (!VALID_INQUIRY_STATUSES.includes(status as (typeof VALID_INQUIRY_STATUSES)[number])) {
      return fail('Trạng thái yêu cầu không hợp lệ.')
    }
    const adminNote = text(data.adminNote, 1000)

    const updated = await payload.update({
      collection: 'sales-inquiries',
      id,
      user,
      overrideAccess: false,
      data: {
        status: status as (typeof VALID_INQUIRY_STATUSES)[number],
        ...(adminNote ? { adminNote } : {}),
      },
    })
    return json({ id: updated.id, status: updated.status })
  } catch (error) {
    return apiError(error)
  }
}

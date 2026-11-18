import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { CONSULTATION_STATUSES, type ConsultationStatus } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['bookings', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const bookingId = new URL(request.url).searchParams.get('bookingId') || ''
    const res = await payload.find({
      collection: 'consultations',
      user,
      overrideAccess: false,
      depth: 1,
      limit: 200,
      sort: '-createdAt',
      ...(bookingId ? { where: { booking: { equals: bookingId } } } : {}),
    })
    return json({ items: res.docs })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['bookings', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'id',
      'claim',
      'status',
      'outcome',
      'callNote',
      'callbackScheduledAt',
      'internalNote',
    ])

    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã yêu cầu tư vấn.')

    const existing = await payload.findByID({
      collection: 'consultations',
      id,
      user,
      overrideAccess: false,
      depth: 0,
    })

    const patch: Record<string, unknown> = {}
    const staffLabel = user.fullName?.trim() || user.email || 'Admin NORI'

    if (data.claim === true) {
      patch.assignedStaff = user.id
      patch.assignedStaffName = staffLabel
      if (existing.status === 'PENDING_CONTACT') {
        patch.status = 'CONTACTING'
      }
    }

    if (data.status !== undefined) {
      const nextStatus = text(data.status, 40)
      if (!CONSULTATION_STATUSES.includes(nextStatus as ConsultationStatus)) {
        return fail('Trạng thái tư vấn không hợp lệ.')
      }
      patch.status = nextStatus
      if (!existing.assignedStaffName) {
        patch.assignedStaff = user.id
        patch.assignedStaffName = staffLabel
      }
    }

    if (data.callbackScheduledAt !== undefined) {
      patch.callbackScheduledAt = text(data.callbackScheduledAt, 40) || null
    }
    if (data.internalNote !== undefined) {
      patch.internalNote = text(data.internalNote, 2000) || null
    }

    const outcome = text(data.outcome, 120)
    const callNote = text(data.callNote, 1000)
    if (outcome || callNote) {
      const prevLogs = Array.isArray(existing.contactLogs) ? existing.contactLogs : []
      patch.contactLogs = [
        ...prevLogs,
        {
          contactedAt: new Date().toISOString(),
          staffName: staffLabel,
          outcome: outcome || 'Cập nhật tư vấn',
          note: callNote || undefined,
          nextCallbackAt: text(data.callbackScheduledAt, 40) || undefined,
        },
      ]
    }

    const updated = await payload.update({
      collection: 'consultations',
      id,
      user,
      overrideAccess: false,
      data: patch,
    })

    return json({
      id: updated.id,
      status: updated.status,
      assignedStaffName: updated.assignedStaffName ?? null,
    })
  } catch (error) {
    return apiError(error)
  }
}

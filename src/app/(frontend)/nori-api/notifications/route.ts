import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import type { NotificationView } from '@/lib/domain-types'

export async function GET() {
  try {
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập để xem thông báo.',
      adminForbiddenMessage: 'Tài khoản quản trị không sử dụng hộp thư thông báo khách hàng.',
    })
    if (!auth.ok) return auth.response
    const user = auth.user
    const payload = await getPayloadClient()

    const res = await payload.find({
      collection: 'notifications',
      user,
      overrideAccess: false,
      depth: 1,
      limit: 30,
      sort: '-createdAt',
    })

    const items: NotificationView[] = res.docs.map((n) => {
      const bookingObj = typeof n.booking === 'object' && n.booking ? n.booking : null
      const bookingId = bookingObj
        ? bookingObj.id
        : typeof n.booking === 'string'
          ? n.booking
          : null
      const bookingStatus = bookingObj?.status ?? null
      const cancelledAfterApprove = bookingStatus === 'CANCELLED' || bookingStatus === 'REJECTED'
      return {
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        bookingId,
        bookingKey: n.bookingKey ?? bookingObj?.bookingKey ?? null,
        bookingStatus,
        vehicleName: n.vehicleName ?? bookingObj?.vehicleNameSnapshot ?? null,
        startDate: n.startDate ?? bookingObj?.startDate ?? null,
        endDate: n.endDate ?? bookingObj?.endDate ?? null,
        pickupTime: n.pickupTime ?? bookingObj?.pickupTime ?? null,
        returnTime: n.returnTime ?? bookingObj?.returnTime ?? null,
        expectedContactDate: n.expectedContactDate ?? bookingObj?.expectedContactDate ?? null,
        workingHoursLabel: n.workingHoursLabel ?? bookingObj?.workingHoursSnapshot ?? null,
        customerPhoneMasked: n.customerPhoneMasked ?? null,
        hotline: n.hotline ?? null,
        isUrgent: Boolean(n.isUrgent),
        paymentConfirmed: Boolean(n.paymentConfirmed),
        superseded: Boolean(n.superseded) || cancelledAfterApprove,
        isRead: Boolean(n.isRead),
        readAt: n.readAt ?? null,
        popupDismissed: Boolean(n.popupDismissed) || cancelledAfterApprove,
        createdAt: n.createdAt,
      }
    })

    const unreadCount = items.filter((i) => !i.isRead && !i.superseded).length
    const activePopup =
      items.find(
        (i) =>
          i.type === 'BOOKING_CONFIRMED' &&
          !i.popupDismissed &&
          !i.superseded &&
          (!i.bookingStatus || ['CONFIRMED', 'READY_FOR_HANDOVER'].includes(i.bookingStatus)),
      ) ?? null

    return json({ items, unreadCount, activePopup })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập.',
      adminForbiddenMessage: 'Tài khoản quản trị không sử dụng hộp thư thông báo khách hàng.',
    })
    if (!auth.ok) return auth.response
    const user = auth.user

    const data = await body(request, ['id', 'markRead', 'dismissPopup', 'markAllRead'])
    const payload = await getPayloadClient()
    const nowIso = new Date().toISOString()

    if (data.markAllRead === true) {
      const unread = await payload.find({
        collection: 'notifications',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 50,
        where: { isRead: { equals: false } },
      })
      for (const n of unread.docs) {
        await payload.update({
          collection: 'notifications',
          id: n.id,
          user,
          overrideAccess: false,
          data: {
            isRead: true,
            readAt: nowIso,
            ...(data.dismissPopup === true
              ? { popupDismissed: true, popupDismissedAt: nowIso }
              : {}),
          },
        })
      }
      return json({ updatedCount: unread.docs.length })
    }

    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã thông báo.')

    const patch: Record<string, unknown> = {}
    if (data.markRead !== false) {
      patch.isRead = true
      patch.readAt = nowIso
    }
    if (data.dismissPopup === true) {
      patch.popupDismissed = true
      patch.popupDismissedAt = nowIso
    }

    const updated = await payload.update({
      collection: 'notifications',
      id,
      user,
      overrideAccess: false,
      data: patch,
    })

    return json({
      id: updated.id,
      isRead: Boolean(updated.isRead),
      popupDismissed: Boolean(updated.popupDismissed),
    })
  } catch (error) {
    return apiError(error)
  }
}

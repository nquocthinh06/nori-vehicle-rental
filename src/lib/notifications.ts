import type { Payload, PayloadRequest } from 'payload'

export type NotificationDispatchResult = {
  inAppSaved: boolean
  externalChannel: 'NONE' | 'WEBHOOK'
  externalStatus: 'NOT_CONFIGURED' | 'DISPATCHED' | 'DEGRADED'
}

export async function dispatchBookingConfirmationNotice(params: {
  payload: Payload
  req?: PayloadRequest
  existingNotifCount: number
  data: {
    eventKey: string
    customerId: string
    bookingId: string
    title: string
    message: string
    bookingKey: string
    vehicleName: string
    startDate: string
    endDate: string
    pickupTime: string
    returnTime: string
    expectedContactDate: string
    workingHoursLabel: string
    customerPhoneMasked: string
    customerEmail?: string
    hotline: string
    isUrgent: boolean
    paymentConfirmed: boolean
  }
}): Promise<NotificationDispatchResult> {
  const { payload, req, existingNotifCount, data } = params
  let inAppSaved = existingNotifCount > 0

  if (!inAppSaved) {
    try {
      await payload.create({
        collection: 'notifications',
        req,
        overrideAccess: true,
        data: {
          eventKey: data.eventKey,
          customer: data.customerId,
          booking: data.bookingId,
          type: 'BOOKING_CONFIRMED',
          title: data.title,
          message: data.message,
          bookingKey: data.bookingKey,
          vehicleName: data.vehicleName,
          startDate: data.startDate,
          endDate: data.endDate,
          pickupTime: data.pickupTime,
          returnTime: data.returnTime,
          expectedContactDate: data.expectedContactDate,
          workingHoursLabel: data.workingHoursLabel,
          customerPhoneMasked: data.customerPhoneMasked,
          hotline: data.hotline,
          isUrgent: data.isUrgent,
          paymentConfirmed: data.paymentConfirmed,
          superseded: false,
          isRead: false,
          popupDismissed: false,
        },
      })
      inAppSaved = true
    } catch {
      inAppSaved = false
    }
  }

  const webhookUrl = process.env.NORI_NOTIFY_WEBHOOK_URL?.trim()
  if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
    return { inAppSaved, externalChannel: 'NONE', externalStatus: 'NOT_CONFIGURED' }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'BOOKING_CONFIRMED',
        bookingKey: data.bookingKey,
        customerEmail: data.customerEmail ?? null,
        title: data.title,
        message: data.message,
        expectedContactDate: data.expectedContactDate,
        isUrgent: data.isUrgent,
      }),
      signal: AbortSignal.timeout(4000),
    })
    return {
      inAppSaved,
      externalChannel: 'WEBHOOK',
      externalStatus: res.ok ? 'DISPATCHED' : 'DEGRADED',
    }
  } catch {
    return { inAppSaved, externalChannel: 'WEBHOOK', externalStatus: 'DEGRADED' }
  }
}

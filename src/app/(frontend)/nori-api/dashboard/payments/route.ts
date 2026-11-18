import { requireAdmin, resolveCustomerDisplayNames } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { withBookingWriteLock } from '@/lib/promo-service'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['payments', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const status = new URL(request.url).searchParams.get('status') || ''
    const [paymentsRes, bookingsRes] = await Promise.all([
      payload.find({
        collection: 'payments',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 200,
        sort: '-createdAt',
        ...(status ? { where: { status: { equals: status } } } : {}),
      }),
      payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 100,
        sort: '-createdAt',
        select: {
          bookingKey: true,
          vehicleReferenceSnapshot: true,
          totalPrice: true,
          status: true,
        },
      }),
    ])

    let confirmedRevenue = 0
    let refundedTotal = 0
    for (const p of paymentsRes.docs) {
      if (p.status === 'CONFIRMED' && p.paymentType !== 'REFUND') {
        confirmedRevenue += Number(p.amount ?? 0)
      } else if (p.status === 'REFUNDED' || p.paymentType === 'REFUND') {
        refundedTotal += Number(p.amount ?? 0)
      }
    }

    const customerNameMap = await resolveCustomerDisplayNames(
      payload,
      paymentsRes.docs
        .map((p) => (typeof p.customer === 'string' ? p.customer : ''))
        .filter(Boolean),
    )

    return json({
      summary: { confirmedRevenue, refundedTotal, totalRecords: paymentsRes.totalDocs },
      items: paymentsRes.docs.map((p) => ({
        id: p.id,
        reference: p.reference ?? p.id,
        paymentType: p.paymentType,
        method: p.method,
        amount: p.amount,
        status: p.status,
        paidAt: p.paidAt ?? p.createdAt,
        recordedBy: p.recordedBy ?? null,
        note: p.note ?? null,
        bookingKey:
          typeof p.booking === 'object' && p.booking
            ? (p.booking.bookingKey ?? p.booking.id)
            : null,
        customerName:
          typeof p.customer === 'object' && p.customer
            ? p.customer.fullName
            : (customerNameMap.get(String(p.customer ?? ''))?.fullName ?? null),
        createdAt: p.createdAt,
      })),
      bookings: bookingsRes.docs.map((b) => ({
        id: b.id,
        bookingKey: b.bookingKey ?? b.id,
        reference: b.vehicleReferenceSnapshot ?? '',
        totalPrice: b.totalPrice ?? 0,
        status: b.status ?? 'PENDING',
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['payments', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'bookingId',
      'paymentType',
      'method',
      'amount',
      'status',
      'paidAt',
      'note',
    ])
    const amount = Number(data.amount)
    if (!Number.isSafeInteger(amount) || amount < 1) {
      return fail('Số tiền giao dịch phải là số nguyên dương.')
    }
    const bookingId = text(data.bookingId, 100) || undefined
    let customerId: string | undefined
    const paymentType = (
      ['DEPOSIT', 'RENTAL_FEE', 'EXTRA_FEE', 'PURCHASE_DEPOSIT', 'REFUND'].includes(
        String(data.paymentType),
      )
        ? data.paymentType
        : 'DEPOSIT'
    ) as 'DEPOSIT' | 'RENTAL_FEE' | 'EXTRA_FEE' | 'PURCHASE_DEPOSIT' | 'REFUND'

    const paidAt = text(data.paidAt, 40) || new Date().toISOString().slice(0, 10)
    const note = text(data.note, 500) || undefined
    const method = (
      ['BANK_TRANSFER', 'CASH', 'CARD_POS'].includes(String(data.method))
        ? data.method
        : 'BANK_TRANSFER'
    ) as 'BANK_TRANSFER' | 'CASH' | 'CARD_POS'
    const paymentStatus = (
      ['PENDING', 'CONFIRMED', 'REFUNDED', 'CANCELLED'].includes(String(data.status))
        ? data.status
        : 'CONFIRMED'
    ) as 'PENDING' | 'CONFIRMED' | 'REFUNDED' | 'CANCELLED'

    return await withBookingWriteLock(async () => {
      if (bookingId) {
        const b = await payload.findByID({
          collection: 'bookings',
          id: bookingId,
          user,
          overrideAccess: false,
          depth: 0,
        })
        if (
          ['CANCELLED', 'REJECTED'].includes(String(b.status ?? '')) &&
          paymentStatus !== 'CANCELLED' &&
          paymentType !== 'REFUND'
        ) {
          return fail(
            'Không thể ghi nhận thu tiền cho đơn thuê đã hủy hoặc đã từ chối.',
            409,
            'INVALID_BOOKING_STATE',
          )
        }
        customerId =
          typeof b.customer === 'object' && b.customer ? b.customer.id : (b.customer ?? undefined)

        const recentDuplicates = await payload.find({
          collection: 'payments',
          user,
          overrideAccess: false,
          limit: 1,
          sort: '-createdAt',
          where: {
            and: [
              { booking: { equals: bookingId } },
              { paymentType: { equals: paymentType } },
              { amount: { equals: amount } },
              { status: { in: ['PENDING', 'CONFIRMED'] } },
            ],
          },
        })
        if (recentDuplicates.totalDocs > 0) {
          const lastCreatedAt = new Date(recentDuplicates.docs[0].createdAt).getTime()
          if (Date.now() - lastCreatedAt < 30_000) {
            return fail(
              'Giao dịch tương tự vừa được tạo cách đây ít giây. Vui lòng không gửi lặp lại.',
              409,
              'DUPLICATE_PAYMENT',
            )
          }
        }
      }

      const created = await payload.create({
        collection: 'payments',
        user,
        overrideAccess: false,
        data: {
          booking: bookingId,
          customer: customerId,
          paymentType,
          method,
          amount,
          status: paymentStatus,
          paidAt,
          note,
        },
      })
      return json({ id: created.id, reference: created.reference }, 201)
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['payments', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, ['id', 'status', 'note'])
    const id = text(data.id, 100)
    const status = text(data.status, 30)
    if (!id || !['PENDING', 'CONFIRMED', 'REFUNDED', 'CANCELLED'].includes(status)) {
      return fail('Thông tin cập nhật giao dịch không hợp lệ.')
    }
    return await withBookingWriteLock(async () => {
      const updated = await payload.update({
        collection: 'payments',
        id,
        user,
        overrideAccess: false,
        data: {
          status: status as 'PENDING' | 'CONFIRMED' | 'REFUNDED' | 'CANCELLED',
          ...(data.note !== undefined ? { note: text(data.note, 500) } : {}),
        },
      })
      return json({ id: updated.id, status: updated.status })
    })
  } catch (error) {
    return apiError(error)
  }
}

import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['customers', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const sp = new URL(request.url).searchParams
    const customerId = sp.get('customerId') || ''

    if (customerId) {
      const [customer, bookings, inquiries, reviews] = await Promise.all([
        payload.findByID({
          collection: 'users',
          id: customerId,
          user,
          overrideAccess: false,
          depth: 0,
        }),
        payload.find({
          collection: 'bookings',
          user,
          overrideAccess: false,
          depth: 0,
          limit: 50,
          sort: '-createdAt',
          where: { customer: { equals: customerId } },
        }),
        payload.find({
          collection: 'sales-inquiries',
          user,
          overrideAccess: false,
          depth: 1,
          limit: 50,
          sort: '-createdAt',
          where: { customer: { equals: customerId } },
        }),
        payload.find({
          collection: 'reviews',
          user,
          overrideAccess: false,
          depth: 1,
          limit: 50,
          sort: '-createdAt',
          where: { customer: { equals: customerId } },
        }),
      ])
      return json({
        customer: {
          id: customer.id,
          fullName: customer.fullName,
          email: customer.email,
          phone: customer.phone ?? null,
          status: customer.status ?? 'ACTIVE',
          driverLicenseNumber: customer.driverLicenseNumber ?? null,
          idCardNumber: customer.idCardNumber ?? null,
          verificationStatus: customer.verificationStatus ?? 'UNVERIFIED',
          verificationNote: customer.verificationNote ?? null,
          createdAt: customer.createdAt,
        },
        bookings: bookings.docs.map((b) => ({
          id: b.id,
          bookingKey: b.bookingKey ?? b.id,
          status: b.status ?? 'PENDING',
          modelName: b.vehicleNameSnapshot ?? 'Chưa cập nhật',
          reference: b.vehicleReferenceSnapshot ?? '',
          startDate: b.startDate,
          endDate: b.endDate,
          totalPrice: b.totalPrice ?? 0,
          createdAt: b.createdAt,
        })),
        inquiries: inquiries.docs.map((inq) => ({
          id: inq.id,
          reference: inq.reference ?? inq.id,
          inquiryType: inq.inquiryType ?? 'CONSULTATION',
          status: inq.status ?? 'NEW',
          modelName: typeof inq.model === 'object' ? inq.model.name : 'Chưa cập nhật',
          quotedPriceSnapshot: inq.quotedPriceSnapshot ?? null,
          createdAt: inq.createdAt,
        })),
        reviews: reviews.docs.map((r) => ({
          id: r.id,
          rating: r.rating,
          title: r.title ?? null,
          comment: r.comment,
          status: r.status ?? 'PUBLISHED',
          modelName: typeof r.model === 'object' ? r.model.name : 'Chưa cập nhật',
          createdAt: r.createdAt,
        })),
      })
    }

    const page = Math.max(1, Number(sp.get('page') || '1') || 1)
    const status = sp.get('status') || ''
    const q = (sp.get('q') || '').trim().toLowerCase()

    const [usersRes, reviewsRes, bookingsRes, inquiriesRes] = await Promise.all([
      payload.find({
        collection: 'users',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        sort: '-createdAt',
        // Explicitly select non-sensitive fields only.
        select: {
          fullName: true,
          email: true,
          phone: true,
          status: true,
          verificationStatus: true,
          createdAt: true,
        },
        ...(status ? { where: { status: { equals: status } } } : {}),
      }),
      payload.find({
        collection: 'reviews',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 100,
        sort: '-createdAt',
      }),
      payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        select: { customer: true },
      }),
      payload.find({
        collection: 'sales-inquiries',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        select: { customer: true },
      }),
    ])

    const bookingCounts = new Map<string, number>()
    for (const b of bookingsRes.docs) {
      const cid = typeof b.customer === 'object' && b.customer ? b.customer.id : b.customer
      if (cid) bookingCounts.set(String(cid), (bookingCounts.get(String(cid)) ?? 0) + 1)
    }
    const inquiryCounts = new Map<string, number>()
    for (const i of inquiriesRes.docs) {
      const cid = typeof i.customer === 'object' && i.customer ? i.customer.id : i.customer
      if (cid) inquiryCounts.set(String(cid), (inquiryCounts.get(String(cid)) ?? 0) + 1)
    }

    const filtered = usersRes.docs
      .filter((u) => {
        if (!q) return true
        return `${u.fullName} ${u.email} ${u.phone ?? ''}`.toLowerCase().includes(q)
      })
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone ?? null,
        status: u.status ?? 'ACTIVE',
        verificationStatus: u.verificationStatus ?? 'UNVERIFIED',
        bookingCount: bookingCounts.get(String(u.id)) ?? 0,
        inquiryCount: inquiryCounts.get(String(u.id)) ?? 0,
        createdAt: u.createdAt,
      }))

    const pageSize = 15
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    const safePage = Math.min(page, totalPages)

    return json({
      items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
      totalDocs: filtered.length,
      page: safePage,
      totalPages,
      reviews: reviewsRes.docs.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title ?? null,
        comment: r.comment,
        status: r.status ?? 'PUBLISHED',
        customerName:
          typeof r.customer === 'object' && r.customer ? r.customer.fullName : 'Khách hàng',
        modelName: typeof r.model === 'object' && r.model ? r.model.name : 'Chưa cập nhật',
        vehicleReference: typeof r.vehicle === 'object' && r.vehicle ? r.vehicle.reference : null,
        createdAt: r.createdAt,
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['customers', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'entity',
      'id',
      'status',
      'verificationStatus',
      'verificationNote',
    ])
    const entity = text(data.entity, 20)
    const id = text(data.id, 100)
    const status = text(data.status, 30)
    if (!id) return fail('Thiếu mã bản ghi.')

    if (entity === 'verification') {
      const vs = text(data.verificationStatus, 30)
      if (!['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'].includes(vs)) {
        return fail('Trạng thái xác minh giấy tờ không hợp lệ.')
      }
      const updated = await payload.update({
        collection: 'users',
        id,
        user,
        overrideAccess: false,
        data: {
          verificationStatus: vs as 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED',
          verificationNote: text(data.verificationNote, 300) || undefined,
        },
      })
      return json({ id: updated.id, verificationStatus: updated.verificationStatus })
    }

    if (entity === 'review') {
      if (!['PUBLISHED', 'HIDDEN'].includes(status))
        return fail('Trạng thái đánh giá không hợp lệ.')
      const updated = await payload.update({
        collection: 'reviews',
        id,
        user,
        overrideAccess: false,
        data: { status: status as 'PUBLISHED' | 'HIDDEN' },
      })
      return json({ id: updated.id, status: updated.status })
    }

    if (!['ACTIVE', 'DISABLED'].includes(status)) return fail('Trạng thái tài khoản không hợp lệ.')
    const updated = await payload.update({
      collection: 'users',
      id,
      user,
      overrideAccess: false,
      data: { status: status as 'ACTIVE' | 'DISABLED' },
    })
    return json({ id: updated.id, status: updated.status })
  } catch (error) {
    return apiError(error)
  }
}

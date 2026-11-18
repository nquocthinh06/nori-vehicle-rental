import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { apiError, assertOrigin, assertRateLimit, body, fail, json, text } from '@/lib/api-utils'
import type { InquiryView } from '@/lib/domain-types'

const VALID_TYPES = ['CONSULTATION', 'QUOTE', 'VIEWING', 'TEST_DRIVE', 'PURCHASE_REQUEST'] as const
const VALID_METHODS = ['DIRECT', 'INSTALLMENT', 'CONSULT_FINANCE'] as const

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    assertRateLimit(request, 'inquiries-create', 40, 60_000)
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập để gửi yêu cầu tư vấn.',
      adminForbiddenMessage:
        'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để gửi yêu cầu tư vấn.',
    })
    if (!auth.ok) return auth.response
    const user = auth.user
    const data = await body(request, [
      'model',
      'phone',
      'note',
      'inquiryType',
      'vehicle',
      'variantName',
      'colorName',
      'paymentMethod',
      'preferredDate',
      'preferredLocation',
    ])
    const phone = text(data.phone, 16)
    const note = text(data.note, 1000)
    if (!/^\+?\d{9,15}$/.test(phone))
      return fail('Số điện thoại cần 9–15 chữ số.', 400, 'VALIDATION_ERROR', {
        phone: 'Số điện thoại chưa hợp lệ.',
      })
    if (note.length > 1000) return fail('Nội dung tối đa 1.000 ký tự.')

    const rawType = text(data.inquiryType, 30)
    const inquiryType = VALID_TYPES.includes(rawType as (typeof VALID_TYPES)[number])
      ? (rawType as (typeof VALID_TYPES)[number])
      : 'CONSULTATION'

    const rawMethod = text(data.paymentMethod, 30)
    const paymentMethod = VALID_METHODS.includes(rawMethod as (typeof VALID_METHODS)[number])
      ? (rawMethod as (typeof VALID_METHODS)[number])
      : 'DIRECT'

    const vehicleId = text(data.vehicle, 100)
    const payload = await getPayloadClient()
    const inquiry = await payload.create({
      collection: 'sales-inquiries',
      user,
      overrideAccess: false,
      data: {
        model: text(data.model, 100),
        phone,
        note,
        inquiryType,
        ...(vehicleId ? { vehicle: vehicleId } : {}),
        variantName: text(data.variantName, 120) || undefined,
        colorName: text(data.colorName, 80) || undefined,
        paymentMethod,
        preferredDate: text(data.preferredDate, 20) || undefined,
        preferredLocation: text(data.preferredLocation, 200) || undefined,
      },
    })
    return json(
      {
        reference: inquiry.reference,
        status: inquiry.status,
        inquiryType: inquiry.inquiryType ?? inquiryType,
      },
      201,
    )
  } catch (error) {
    return apiError(error)
  }
}

export async function GET() {
  try {
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập.',
      adminForbiddenMessage:
        'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng quản lý yêu cầu mua xe trong trang Quản trị hệ thống.',
    })
    if (!auth.ok) return auth.response
    const user = auth.user
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'sales-inquiries',
      user,
      overrideAccess: false,
      depth: 1,
      limit: 50,
      sort: '-createdAt',
    })
    const items: InquiryView[] = result.docs.map((d) => ({
      id: d.id,
      reference: d.reference ?? d.id,
      inquiryType: d.inquiryType ?? 'CONSULTATION',
      status: d.status ?? 'NEW',
      modelName: typeof d.model === 'object' ? d.model.name : 'Chưa cập nhật',
      modelSlug: typeof d.model === 'object' ? d.model.slug : '',
      vehicleReference: d.vehicleReference ?? null,
      variantName: d.variantName ?? null,
      colorName: d.colorName ?? null,
      paymentMethod: d.paymentMethod ?? null,
      preferredDate: d.preferredDate ?? null,
      preferredLocation: d.preferredLocation ?? null,
      quotedPriceSnapshot: d.quotedPriceSnapshot ?? null,
      estimatedRollingSnapshot: d.estimatedRollingSnapshot ?? null,
      note: d.note ?? null,
      createdAt: d.createdAt,
    }))
    return json(items)
  } catch (error) {
    return apiError(error)
  }
}

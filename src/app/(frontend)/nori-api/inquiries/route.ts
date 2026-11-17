import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const user = await appAuth.currentUser()
    if (!user) return fail('Vui lòng đăng nhập để gửi yêu cầu tư vấn.', 401, 'UNAUTHORIZED')
    const data = await body(request, ['model', 'phone', 'note'])
    const phone = text(data.phone, 16)
    const note = text(data.note, 1000)
    if (!/^\+?\d{9,15}$/.test(phone))
      return fail('Số điện thoại cần 9–15 chữ số.', 400, 'VALIDATION_ERROR', {
        phone: 'Số điện thoại chưa hợp lệ.',
      })
    if (note.length > 1000) return fail('Nội dung tối đa 1.000 ký tự.')
    const payload = await getPayloadClient()
    const inquiry = await payload.create({
      collection: 'sales-inquiries',
      user,
      overrideAccess: false,
      data: { model: text(data.model, 100), phone, note },
    })
    return json({ reference: inquiry.reference, status: inquiry.status }, 201)
  } catch (error) {
    return apiError(error)
  }
}

export async function GET() {
  try {
    const user = await appAuth.currentUser()
    if (!user) return fail('Vui lòng đăng nhập.', 401, 'UNAUTHORIZED')
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'sales-inquiries',
      user,
      overrideAccess: false,
      depth: 1,
      limit: 50,
      sort: '-createdAt',
    })
    return json(
      result.docs.map((d) => ({
        id: d.id,
        reference: d.reference,
        status: d.status,
        modelName: typeof d.model === 'object' ? d.model.name : 'Chưa cập nhật',
        createdAt: d.createdAt,
      })),
    )
  } catch (error) {
    return apiError(error)
  }
}

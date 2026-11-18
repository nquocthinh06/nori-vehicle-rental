import { createHmac, timingSafeEqual } from 'node:crypto'
import { getPayloadClient } from '@/lib/payload'
import { fail, json } from '@/lib/api-utils'
import { invalidateNoriCaches } from '@/lib/public-cache'

export async function POST(request: Request) {
  const timestamp = request.headers.get('x-nori-time') ?? ''
  const signature = request.headers.get('x-nori-signature') ?? ''
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 120_000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return fail('Không có quyền làm mới cache.', 401, 'UNAUTHORIZED')
  const raw = await request.text()
  if (raw.length > 6000) return fail('Yêu cầu không hợp lệ.')
  const payload = await getPayloadClient()
  const expected = createHmac('sha256', payload.secret).update(`${timestamp}.${raw}`).digest()
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected))
    return fail('Không có quyền làm mới cache.', 401, 'UNAUTHORIZED')
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return fail('Yêu cầu không hợp lệ.')
  }
  const postSlugsValid =
    data.postSlugs === undefined ||
    (Array.isArray(data.postSlugs) &&
      data.postSlugs.length <= 20 &&
      data.postSlugs.every(
        (s: unknown) => typeof s === 'string' && s.length <= 200 && /^[a-z0-9_-]+$/i.test(s),
      ))
  const allPostsValid = data.allPosts === undefined || typeof data.allPosts === 'boolean'

  if (
    !Array.isArray(data.slugs) ||
    data.slugs.length > 20 ||
    data.slugs.some(
      (s: unknown) => typeof s !== 'string' || s.length > 200 || !/^[a-z0-9_-]+$/i.test(s),
    ) ||
    typeof data.allDetails !== 'boolean' ||
    !postSlugsValid ||
    !allPostsValid
  )
    return fail('Khóa cache không hợp lệ.')
  invalidateNoriCaches({
    slugs: data.slugs,
    allDetails: data.allDetails,
    postSlugs: data.postSlugs,
    allPosts: data.allPosts,
  })
  return json({ invalidated: true })
}

import { GET as statusGet } from '../route'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const url = new URL(request.url)
  url.searchParams.set('id', id)
  const forwarded = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  })
  return statusGet(forwarded)
}

'use client'

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string> = {},
  ) {
    super(message)
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/nori-api${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...options?.headers,
      },
    })
  } catch {
    throw new RequestError('Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.', 0)
  }
  let result
  try {
    result = await response.json()
  } catch {
    throw new RequestError('Phản hồi chưa hợp lệ. Vui lòng thử lại sau.', response.status)
  }
  if (!response.ok || !result.success)
    throw new RequestError(
      result.error?.message ?? 'Chưa thể xử lý yêu cầu. Vui lòng thử lại.',
      response.status,
      result.error?.fields ?? {},
    )
  return result.data as T
}

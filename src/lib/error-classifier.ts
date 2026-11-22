export type ClassifiedErrorCategory =
  | 'DATABASE_TIMEOUT'
  | 'REQUEST_TIMEOUT'
  | 'DATABASE_UNAVAILABLE'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'DATABASE_SCHEMA_ERROR'
  | 'SYSTEM_ERROR'

export type ClassifiedErrorResult = {
  category: ClassifiedErrorCategory
  status: number
  code: string
  userMessage: string
  dbCode: string
  summary: string
}

type DbErrorMeta = {
  code?: string
  cause?: DbErrorMeta
  original?: DbErrorMeta
  name?: string
  message?: string
}

export function extractDbCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const err = error as DbErrorMeta
  return (
    (typeof err.code === 'string' && err.code) ||
    (err.cause && typeof err.cause.code === 'string' && err.cause.code) ||
    (err.original && typeof err.original.code === 'string' && err.original.code) ||
    ''
  )
}

export function classifyUnexpectedError(error: unknown): ClassifiedErrorResult {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorName = error instanceof Error ? error.name : ''
  const dbCode = extractDbCode(error)

  const isTimeout =
    errorName === 'AbortError' ||
    errorName === 'TimeoutError' ||
    dbCode === 'ETIMEDOUT' ||
    dbCode === '57014' ||
    /statement timeout|query read timeout|connection timeout|timed out|exceeded timeout/i.test(
      errorMessage,
    )
  if (isTimeout) {
    const isDbTimeout = dbCode === '57014' || /statement timeout|query/i.test(errorMessage)
    const category = isDbTimeout ? 'DATABASE_TIMEOUT' : 'REQUEST_TIMEOUT'
    return {
      category,
      status: 504,
      code: category,
      userMessage:
        'Hệ thống đang xử lý chậm hoặc quá thời gian chờ phản hồi. Vui lòng thử lại sau ít giây.',
      dbCode,
      summary: errorMessage.slice(0, 240),
    }
  }

  const isDbDisconnect =
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'EPIPE',
      'ENOTFOUND',
      '57P01',
      '57P02',
      '57P03',
      '53300',
    ].includes(dbCode) ||
    dbCode.startsWith('08') ||
    /Connection terminated|cannot begin transaction|too many clients|sorry, too many clients/i.test(
      errorMessage,
    )
  if (isDbDisconnect) {
    return {
      category: 'DATABASE_UNAVAILABLE',
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      userMessage: 'Kết nối cơ sở dữ liệu tạm thời gián đoạn. Vui lòng thử lại sau ít giây.',
      dbCode,
      summary: errorMessage.slice(0, 240),
    }
  }

  const isLockContention =
    dbCode === '40P01' ||
    dbCode === '40001' ||
    /SQLITE_BUSY|database is locked|deadlock detected|could not serialize/i.test(errorMessage)
  if (isLockContention) {
    return {
      category: 'CONFLICT',
      status: 409,
      code: 'CONFLICT',
      userMessage: 'Dữ liệu vừa được cập nhật đồng thời. Vui lòng kiểm tra lại.',
      dbCode,
      summary: errorMessage.slice(0, 240),
    }
  }

  if (dbCode === '22P02' || dbCode === '22003') {
    return {
      category: 'VALIDATION_ERROR',
      status: 400,
      code: 'VALIDATION_ERROR',
      userMessage: 'Mã định danh hoặc tham số truy vấn không hợp lệ.',
      dbCode,
      summary: errorMessage.slice(0, 240),
    }
  }

  const isSchemaError =
    dbCode === '42P01' ||
    dbCode === '42703' ||
    errorMessage.includes('SQLITE_ERROR') ||
    errorMessage.includes('LibsqlError') ||
    errorMessage.includes('no such column') ||
    errorMessage.includes('no such table')

  if (isSchemaError) {
    const isColumnMissing = errorMessage.includes('no such column') || dbCode === '42703'
    const isTableMissing = errorMessage.includes('no such table') || dbCode === '42P01'
    const summaryPrefix = isColumnMissing
      ? 'Cơ sở dữ liệu đang thiếu cột dữ liệu nghiệp vụ (cần chạy migration).'
      : isTableMissing
        ? 'Cơ sở dữ liệu chưa hoàn thiện bảng nghiệp vụ (cần chạy migration).'
        : 'Lỗi truy vấn cơ sở dữ liệu.'
    return {
      category: 'DATABASE_SCHEMA_ERROR',
      status: 503,
      code: 'DATABASE_ERROR',
      userMessage:
        'Hệ thống đang bảo trì dữ liệu hoặc cơ sở dữ liệu chưa sẵn sàng. Vui lòng thử lại sau.',
      dbCode,
      summary: `${summaryPrefix}: ${errorMessage}`.slice(0, 240),
    }
  }

  return {
    category: 'SYSTEM_ERROR',
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    userMessage: 'NORI chưa thể xử lý yêu cầu. Vui lòng thử lại sau.',
    dbCode,
    summary: errorMessage.slice(0, 240),
  }
}

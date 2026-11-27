import { parseAddonKeys, validateRentalDates, type AddonDefinition } from '../rental-rules.ts'
import type { AIToolDefinition, AllowedToolName } from './types.ts'

export const AI_TOOL_DEFINITIONS: AIToolDefinition[] = [
  {
    name: 'searchVehicles',
    description:
      'Tìm kiếm phương tiện đang kinh doanh thực tế trong database NORI theo danh mục, hãng, tên dòng xe, số chỗ, giá thuê/ngày, nhiên liệu, hộp số, mục đích sử dụng và tùy chọn kiểm tra khả dụng theo ngày nhận/trả.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Từ khóa tìm theo tên dòng xe hoặc hãng xe' },
        category: {
          type: 'string',
          enum: ['CAR', 'MOTORBIKE', 'PICKUP'],
          description: 'Danh mục phương tiện: CAR (Ô tô), MOTORBIKE (Xe máy), PICKUP (Bán tải)',
        },
        brand: {
          type: 'string',
          description: 'Hãng sản xuất (ví dụ: Toyota, Honda, Ford, VinFast)',
        },
        minSeats: { type: 'integer', minimum: 1, maximum: 60, description: 'Số chỗ tối thiểu' },
        maxPricePerDay: {
          type: 'number',
          minimum: 50000,
          description: 'Ngân sách tối đa VNĐ/ngày',
        },
        minPricePerDay: { type: 'number', minimum: 0, description: 'Giá thuê tối thiểu VNĐ/ngày' },
        fuelType: {
          type: 'string',
          description: 'Loại nhiên liệu: Xăng, Dầu (Diesel), Điện (EV), Hybrid',
        },
        transmission: { type: 'string', description: 'Hộp số: Tự động, Số sàn, CVT...' },
        purpose: {
          type: 'string',
          description: 'Mục đích sử dụng: gia đình, đi phố, phượt, công tác, chở hàng, địa hình',
        },
        startDate: { type: 'string', description: 'Ngày nhận xe YYYY-MM-DD (tùy chọn)' },
        endDate: { type: 'string', description: 'Ngày trả xe YYYY-MM-DD (tùy chọn)' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 8,
          description: 'Số kết quả tối đa (mặc định 5)',
        },
      },
    },
  },
  {
    name: 'getVehicleDetails',
    description:
      'Tra cứu chi tiết dòng xe catalogue và danh sách các cá thể xe thực tế thuộc dòng xe đó (thông số, tiện nghi, phiên bản, đánh giá đã xác minh, trạng thái kinh doanh). Không trả thông tin nội bộ như biển số.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        slug: { type: 'string', description: 'Slug chính xác của dòng xe' },
        query: { type: 'string', description: 'Tên dòng xe hoặc mã xe nếu chưa biết slug' },
      },
    },
  },
  {
    name: 'checkAvailability',
    description:
      'Kiểm tra lịch trống thực tế của một phương tiện theo ngày nhận và ngày trả (kiểm tra trạng thái xe, đơn thuê đang giữ lịch, bảo dưỡng, điều chuyển và khóa ngày rental_days). Bắt buộc đủ startDate và endDate.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vehicleId: { type: 'string', description: 'ID cá thể xe thực tế (nếu đã biết)' },
        vehicleQuery: {
          type: 'string',
          description: 'Tên dòng xe, slug hoặc mã xe (ví dụ: Toyota Fortuner)',
        },
        startDate: { type: 'string', description: 'Ngày nhận xe YYYY-MM-DD' },
        endDate: { type: 'string', description: 'Ngày trả xe YYYY-MM-DD' },
        pickupBranchId: { type: 'string', description: 'ID chi nhánh nhận xe (tùy chọn)' },
        returnBranchId: { type: 'string', description: 'ID chi nhánh trả xe (tùy chọn)' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'calculateRentalPrice',
    description:
      'Tính báo giá thuê xe chính thức bằng Business Rule Engine của NORI (giá theo ngày, số ngày thuê [startDate, endDate), chiết khấu tuần/tháng, phụ phí cuối tuần/ngày lễ, dịch vụ bổ sung, khuyến mãi, tiền cọc và số tiền còn lại).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vehicleId: { type: 'string', description: 'ID cá thể xe thực tế (ưu tiên nếu có)' },
        vehicleQuery: { type: 'string', description: 'Tên dòng xe, slug hoặc mã xe' },
        startDate: { type: 'string', description: 'Ngày nhận xe YYYY-MM-DD' },
        endDate: { type: 'string', description: 'Ngày trả xe YYYY-MM-DD' },
        addons: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['EXTENDED_INSURANCE', 'CHILD_SEAT', 'EXTRA_HELMET', 'DASHCAM'],
          },
          description: 'Danh sách dịch vụ bổ sung hợp lệ',
        },
        deliveryRequested: { type: 'boolean', description: 'Có yêu cầu giao xe tận nơi hay không' },
        promoCode: { type: 'string', description: 'Mã khuyến mãi khách muốn kiểm tra áp dụng' },
        pickupBranchId: { type: 'string', description: 'ID chi nhánh nhận xe (tùy chọn)' },
        returnBranchId: { type: 'string', description: 'ID chi nhánh trả xe (tùy chọn)' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'getActivePromotions',
    description:
      'Tra cứu các chương trình khuyến mãi công khai đang còn hiệu lực tại NORI hoặc xác minh tính hợp lệ của một mã giảm giá cụ thể.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: { type: 'string', description: 'Mã khuyến mãi cụ thể cần kiểm tra (tùy chọn)' },
        appliesTo: {
          type: 'string',
          enum: ['ALL', 'RENT', 'SALE'],
          description: 'Phạm vi dịch vụ (mặc định RENT)',
        },
      },
    },
  },
  {
    name: 'compareVehicles',
    description:
      'So sánh từ 2 đến 4 dòng xe theo dữ liệu thực tế (giá thuê/ngày, số chỗ, hộp số, nhiên liệu, tiện nghi, thông số kỹ thuật, đánh giá và tổng chi phí thuê nếu cùng khoảng ngày).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        slugs: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 4,
          description: 'Danh sách 2-4 slug dòng xe cần so sánh',
        },
        queries: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 4,
          description: 'Danh sách 2-4 tên dòng xe nếu chưa có slug',
        },
        startDate: {
          type: 'string',
          description: 'Ngày nhận xe YYYY-MM-DD (tùy chọn để so sánh tổng chi phí)',
        },
        endDate: { type: 'string', description: 'Ngày trả xe YYYY-MM-DD (tùy chọn)' },
      },
    },
  },
  {
    name: 'getRentalPolicy',
    description:
      'Tra cứu chính sách công khai, điều kiện thuê xe, quy định đặt cọc, hủy đơn, hoàn tiền, bảo hiểm, giao nhận xe, FAQ, bài viết hướng dẫn đã xuất bản và thông tin liên hệ chính thức của NORI.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Câu hỏi hoặc chủ đề chính sách cần tra cứu' },
        topic: {
          type: 'string',
          enum: [
            'ALL',
            'CONDITIONS',
            'DEPOSIT',
            'CANCELLATION',
            'REFUND',
            'INSURANCE',
            'HANDOVER',
            'PRIVACY',
            'TERMS',
            'FAQ',
            'CONTACT',
          ],
          description: 'Nhóm chủ đề chính sách (tùy chọn)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'recommendVehicles',
    description:
      'Đề xuất danh sách phương tiện phù hợp nhất bằng NORI Hybrid Recommendation Engine (lọc cứng theo điều kiện bắt buộc + chấm điểm có trọng số minh bạch + giải thích lý do đề xuất).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        userQuery: {
          type: 'string',
          description: 'Mô tả nhu cầu gốc của khách hàng bằng ngôn ngữ tự nhiên',
        },
        category: { type: 'string', enum: ['CAR', 'MOTORBIKE', 'PICKUP'] },
        seats: { type: 'integer', minimum: 1, maximum: 60 },
        maxBudgetPerDay: { type: 'number', minimum: 50000 },
        strictBudget: {
          type: 'boolean',
          description: 'True nếu khách yêu cầu nghiêm ngặt không vượt ngân sách tối đa',
        },
        fuelType: { type: 'string' },
        transmission: { type: 'string' },
        purpose: { type: 'string' },
        startDate: { type: 'string', description: 'Ngày nhận xe YYYY-MM-DD (tùy chọn)' },
        endDate: { type: 'string', description: 'Ngày trả xe YYYY-MM-DD (tùy chọn)' },
        limit: { type: 'integer', minimum: 1, maximum: 6 },
      },
      required: ['userQuery'],
    },
  },
  {
    name: 'prepareBooking',
    description:
      'Chuẩn bị thông tin và liên kết điều hướng khách hàng tới trang chi tiết xe hoặc trang Checkout chính thức của NORI. KHÔNG tự tạo đơn thuê, KHÔNG duyệt đơn và KHÔNG thay đổi database.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vehicleId: { type: 'string', description: 'ID cá thể xe thực tế' },
        modelSlug: { type: 'string', description: 'Slug dòng xe' },
        vehicleQuery: { type: 'string', description: 'Tên dòng xe hoặc mã xe' },
        startDate: { type: 'string', description: 'Ngày nhận xe YYYY-MM-DD (tùy chọn)' },
        endDate: { type: 'string', description: 'Ngày trả xe YYYY-MM-DD (tùy chọn)' },
        addons: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['EXTENDED_INSURANCE', 'CHILD_SEAT', 'EXTRA_HELMET', 'DASHCAM'],
          },
        },
        pickupBranchId: { type: 'string' },
      },
    },
  },
]

export type ValidatedSearchVehiclesArgs = {
  query?: string
  category?: 'CAR' | 'MOTORBIKE' | 'PICKUP'
  brand?: string
  minSeats?: number
  maxPricePerDay?: number
  minPricePerDay?: number
  fuelType?: string
  transmission?: string
  purpose?: string
  startDate?: string
  endDate?: string
  limit: number
}

export type ValidatedGetVehicleDetailsArgs = {
  slug?: string
  query?: string
}

export type ValidatedCheckAvailabilityArgs = {
  vehicleId?: string
  vehicleQuery?: string
  startDate: string
  endDate: string
  pickupBranchId?: string
  returnBranchId?: string
}

export type ValidatedCalculateRentalPriceArgs = {
  vehicleId?: string
  vehicleQuery?: string
  startDate: string
  endDate: string
  addons: AddonDefinition['id'][]
  deliveryRequested: boolean
  promoCode?: string
  pickupBranchId?: string
  returnBranchId?: string
}

export type ValidatedGetActivePromotionsArgs = {
  code?: string
  appliesTo: 'ALL' | 'RENT' | 'SALE'
}

export type ValidatedCompareVehiclesArgs = {
  slugs: string[]
  queries: string[]
  startDate?: string
  endDate?: string
}

export type ValidatedGetRentalPolicyArgs = {
  query: string
  topic: string
}

export type ValidatedRecommendVehiclesArgs = {
  userQuery: string
  category?: 'CAR' | 'MOTORBIKE' | 'PICKUP'
  seats?: number
  maxBudgetPerDay?: number
  strictBudget: boolean
  fuelType?: string
  transmission?: string
  purpose?: string
  startDate?: string
  endDate?: string
  limit: number
}

export type ValidatedPrepareBookingArgs = {
  vehicleId?: string
  modelSlug?: string
  vehicleQuery?: string
  startDate?: string
  endDate?: string
  addons: AddonDefinition['id'][]
  pickupBranchId?: string
}

function safeStr(v: unknown, max = 160): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim().slice(0, max)
  return t ? t : undefined
}

function safeNum(v: unknown, min: number, max: number): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) return undefined
  return Math.min(max, Math.max(min, n))
}

function safeCategory(v: unknown): 'CAR' | 'MOTORBIKE' | 'PICKUP' | undefined {
  const s = safeStr(v, 20)?.toUpperCase()
  if (s === 'CAR' || s === 'MOTORBIKE' || s === 'PICKUP') return s
  return undefined
}

function safeDateStr(v: unknown): string | undefined {
  const s = safeStr(v, 10)
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  return s
}

export type ToolArgValidationResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/**
 * Strictly validates and allowlists tool arguments produced by the AI model.
 * Unvalidated model JSON NEVER reaches business services or database queries.
 */
export function validateToolArguments(
  name: AllowedToolName,
  rawArgs: unknown,
): ToolArgValidationResult {
  const obj =
    rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {}

  switch (name) {
    case 'searchVehicles': {
      const startDate = safeDateStr(obj.startDate)
      const endDate = safeDateStr(obj.endDate)
      if ((startDate && !endDate) || (!startDate && endDate)) {
        return {
          ok: false,
          error: 'Vui lòng cung cấp đầy đủ cả ngày nhận xe (startDate) và ngày trả xe (endDate).',
        }
      }
      if (startDate && endDate) {
        const dv = validateRentalDates(startDate, endDate)
        if (dv.error) return { ok: false, error: dv.error }
      }
      const data: ValidatedSearchVehiclesArgs = {
        query: safeStr(obj.query, 120),
        category: safeCategory(obj.category),
        brand: safeStr(obj.brand, 60),
        minSeats: safeNum(obj.minSeats, 1, 60),
        maxPricePerDay: safeNum(obj.maxPricePerDay, 50_000, 100_000_000),
        minPricePerDay: safeNum(obj.minPricePerDay, 0, 100_000_000),
        fuelType: safeStr(obj.fuelType, 40),
        transmission: safeStr(obj.transmission, 40),
        purpose: safeStr(obj.purpose, 100),
        startDate,
        endDate,
        limit: Math.round(safeNum(obj.limit, 1, 8) ?? 5),
      }
      return { ok: true, data }
    }

    case 'getVehicleDetails': {
      const slug = safeStr(obj.slug, 120)
      const query = safeStr(obj.query, 120)
      if (!slug && !query) {
        return { ok: false, error: 'Cần cung cấp tên hoặc slug dòng xe cần xem chi tiết.' }
      }
      const data: ValidatedGetVehicleDetailsArgs = { slug, query }
      return { ok: true, data }
    }

    case 'checkAvailability': {
      const startDate = safeDateStr(obj.startDate)
      const endDate = safeDateStr(obj.endDate)
      if (!startDate || !endDate) {
        return {
          ok: false,
          error:
            'Cần đầy đủ ngày nhận xe (startDate) và ngày trả xe (endDate) định dạng YYYY-MM-DD để kiểm tra lịch trống.',
        }
      }
      const dv = validateRentalDates(startDate, endDate)
      if (dv.error) return { ok: false, error: dv.error }
      const vehicleId = safeStr(obj.vehicleId, 80)
      const vehicleQuery = safeStr(obj.vehicleQuery, 120)
      if (!vehicleId && !vehicleQuery) {
        return { ok: false, error: 'Vui lòng cho biết dòng xe hoặc mã xe cần kiểm tra lịch trống.' }
      }
      const data: ValidatedCheckAvailabilityArgs = {
        vehicleId,
        vehicleQuery,
        startDate,
        endDate,
        pickupBranchId: safeStr(obj.pickupBranchId, 80),
        returnBranchId: safeStr(obj.returnBranchId, 80),
      }
      return { ok: true, data }
    }

    case 'calculateRentalPrice': {
      const startDate = safeDateStr(obj.startDate)
      const endDate = safeDateStr(obj.endDate)
      if (!startDate || !endDate) {
        return {
          ok: false,
          error:
            'Cần đầy đủ ngày nhận xe (startDate) và ngày trả xe (endDate) định dạng YYYY-MM-DD để tính báo giá thuê xe.',
        }
      }
      const dv = validateRentalDates(startDate, endDate)
      if (dv.error) return { ok: false, error: dv.error }
      const vehicleId = safeStr(obj.vehicleId, 80)
      const vehicleQuery = safeStr(obj.vehicleQuery, 120)
      if (!vehicleId && !vehicleQuery) {
        return { ok: false, error: 'Vui lòng cho biết dòng xe hoặc mã xe cần tính giá thuê.' }
      }
      const rawAddons = Array.isArray(obj.addons)
        ? obj.addons.filter((a): a is string => typeof a === 'string')
        : []
      const data: ValidatedCalculateRentalPriceArgs = {
        vehicleId,
        vehicleQuery,
        startDate,
        endDate,
        addons: parseAddonKeys(rawAddons),
        deliveryRequested: Boolean(obj.deliveryRequested),
        promoCode: safeStr(obj.promoCode, 40)?.toUpperCase(),
        pickupBranchId: safeStr(obj.pickupBranchId, 80),
        returnBranchId: safeStr(obj.returnBranchId, 80),
      }
      return { ok: true, data }
    }

    case 'getActivePromotions': {
      const rawScope = safeStr(obj.appliesTo, 16)?.toUpperCase()
      const appliesTo: 'ALL' | 'RENT' | 'SALE' =
        rawScope === 'ALL' || rawScope === 'SALE' ? rawScope : 'RENT'
      const data: ValidatedGetActivePromotionsArgs = {
        code: safeStr(obj.code, 40)?.toUpperCase(),
        appliesTo,
      }
      return { ok: true, data }
    }

    case 'compareVehicles': {
      const slugs = Array.isArray(obj.slugs)
        ? obj.slugs
            .map((s) => safeStr(s, 100))
            .filter((s): s is string => Boolean(s))
            .slice(0, 4)
        : []
      const queries = Array.isArray(obj.queries)
        ? obj.queries
            .map((q) => safeStr(q, 100))
            .filter((q): q is string => Boolean(q))
            .slice(0, 4)
        : []
      if (slugs.length + queries.length < 2) {
        return { ok: false, error: 'Vui lòng chọn ít nhất 2 phương tiện để so sánh.' }
      }
      const startDate = safeDateStr(obj.startDate)
      const endDate = safeDateStr(obj.endDate)
      if (startDate && endDate) {
        const dv = validateRentalDates(startDate, endDate)
        if (dv.error) return { ok: false, error: dv.error }
      }
      const data: ValidatedCompareVehiclesArgs = {
        slugs,
        queries,
        startDate: startDate && endDate ? startDate : undefined,
        endDate: startDate && endDate ? endDate : undefined,
      }
      return { ok: true, data }
    }

    case 'getRentalPolicy': {
      const query = safeStr(obj.query, 240)
      if (!query) {
        return { ok: false, error: 'Vui lòng cung cấp câu hỏi hoặc chủ đề chính sách cần tra cứu.' }
      }
      const topic = safeStr(obj.topic, 32)?.toUpperCase() ?? 'ALL'
      const data: ValidatedGetRentalPolicyArgs = { query, topic }
      return { ok: true, data }
    }

    case 'recommendVehicles': {
      const userQuery = safeStr(obj.userQuery, 500) ?? 'Gợi ý xe phù hợp'
      const startDate = safeDateStr(obj.startDate)
      const endDate = safeDateStr(obj.endDate)
      if (startDate && endDate) {
        const dv = validateRentalDates(startDate, endDate)
        if (dv.error) return { ok: false, error: dv.error }
      }
      const data: ValidatedRecommendVehiclesArgs = {
        userQuery,
        category: safeCategory(obj.category),
        seats: safeNum(obj.seats, 1, 60),
        maxBudgetPerDay: safeNum(obj.maxBudgetPerDay, 50_000, 100_000_000),
        strictBudget: Boolean(obj.strictBudget),
        fuelType: safeStr(obj.fuelType, 40),
        transmission: safeStr(obj.transmission, 40),
        purpose: safeStr(obj.purpose, 100),
        startDate: startDate && endDate ? startDate : undefined,
        endDate: startDate && endDate ? endDate : undefined,
        limit: Math.round(safeNum(obj.limit, 1, 6) ?? 4),
      }
      return { ok: true, data }
    }

    case 'prepareBooking': {
      const startDate = safeDateStr(obj.startDate)
      const endDate = safeDateStr(obj.endDate)
      if (startDate && endDate) {
        const dv = validateRentalDates(startDate, endDate)
        if (dv.error) return { ok: false, error: dv.error }
      }
      const rawAddons = Array.isArray(obj.addons)
        ? obj.addons.filter((a): a is string => typeof a === 'string')
        : []
      const data: ValidatedPrepareBookingArgs = {
        vehicleId: safeStr(obj.vehicleId, 80),
        modelSlug: safeStr(obj.modelSlug, 120),
        vehicleQuery: safeStr(obj.vehicleQuery, 120),
        startDate: startDate && endDate ? startDate : undefined,
        endDate: startDate && endDate ? endDate : undefined,
        addons: parseAddonKeys(rawAddons),
        pickupBranchId: safeStr(obj.pickupBranchId, 80),
      }
      return { ok: true, data }
    }

    default:
      return { ok: false, error: 'Công cụ không nằm trong danh sách cho phép.' }
  }
}

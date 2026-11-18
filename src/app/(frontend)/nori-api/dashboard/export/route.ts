import { adminHasPermission, type AdminModule } from '@/access/nori'
import { requireAdmin, resolveCustomerDisplayNames } from '@/lib/admin-api'
import { apiError, fail } from '@/lib/api-utils'

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

function buildCsv(headersRow: string[], rows: unknown[][]): string {
  const lines = [
    headersRow.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ]
  return `\uFEFF${lines.join('\r\n')}`
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const exportType = sp.get('type') ?? 'bookings'
    const entityModuleMap: Partial<Record<string, AdminModule>> = {
      bookings: 'bookings',
      inquiries: 'inquiries',
      vehicles: 'vehicles',
      customers: 'customers',
      financial: 'reports',
    }
    const targetModule = entityModuleMap[exportType]
    if (exportType === 'customers' && !adminHasPermission(admin, 'customers', 'read')) {
      return fail(`Tài khoản chưa được cấp quyền xuất dữ liệu "${exportType}".`, 403, 'FORBIDDEN')
    }
    if (
      targetModule &&
      exportType !== 'customers' &&
      !adminHasPermission(admin, 'reports', 'read') &&
      (exportType === 'financial' || !adminHasPermission(admin, targetModule, 'read'))
    ) {
      return fail(`Tài khoản chưa được cấp quyền xuất dữ liệu "${exportType}".`, 403, 'FORBIDDEN')
    }
    const fromDate = sp.get('from') || ''
    const toDate = sp.get('to') || ''
    const createdAtFilter =
      fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { greater_than_equal: `${fromDate}T00:00:00.000Z` } : {}),
              ...(toDate ? { less_than_equal: `${toDate}T23:59:59.999Z` } : {}),
            },
          }
        : undefined
    let csv = ''
    let filename = 'nori-bookings.csv'

    if (exportType === 'bookings') {
      const result = await payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 500,
        sort: '-createdAt',
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      })
      const nameMap = await resolveCustomerDisplayNames(
        payload,
        result.docs.map((b) => (typeof b.customer === 'string' ? b.customer : '')).filter(Boolean),
      )
      csv = buildCsv(
        [
          'MaDon',
          'TrangThai',
          'KhachHang',
          'SoDienThoai',
          'DoiTacXe',
          'MaXe',
          'NgayNhan',
          'NgayTra',
          'SoNgay',
          'TongTienThueVND',
          'TienCocVND',
          'NgayTao',
        ],
        result.docs.map((b) => [
          b.bookingKey ?? b.id,
          b.status ?? 'PENDING',
          typeof b.customer === 'object'
            ? (b.customer?.fullName ?? '')
            : (nameMap.get(String(b.customer ?? ''))?.fullName ?? ''),
          b.customerPhone ?? '',
          b.vehicleNameSnapshot ?? '',
          b.vehicleReferenceSnapshot ?? '',
          b.startDate,
          b.endDate,
          b.totalDays ?? 0,
          b.totalPrice ?? 0,
          b.depositSnapshot ?? 0,
          b.createdAt,
        ]),
      )
      filename = 'nori-bookings.csv'
    } else if (exportType === 'inquiries') {
      const result = await payload.find({
        collection: 'sales-inquiries',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 500,
        sort: '-createdAt',
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      })
      const nameMap = await resolveCustomerDisplayNames(
        payload,
        result.docs.map((i) => (typeof i.customer === 'string' ? i.customer : '')).filter(Boolean),
      )
      csv = buildCsv(
        [
          'MaYeuCau',
          'LoaiYeuCau',
          'TrangThai',
          'KhachHang',
          'SoDienThoai',
          'DongXe',
          'MaXeThucTe',
          'GiaBanThamKhaoVND',
          'NgayHen',
          'NgayTao',
        ],
        result.docs.map((i) => [
          i.reference ?? i.id,
          i.inquiryType ?? 'CONSULTATION',
          i.status ?? 'NEW',
          typeof i.customer === 'object'
            ? (i.customer?.fullName ?? '')
            : (nameMap.get(String(i.customer ?? ''))?.fullName ?? ''),
          i.phone,
          typeof i.model === 'object' ? i.model?.name : '',
          i.vehicleReference ?? '',
          i.quotedPriceSnapshot ?? '',
          i.preferredDate ?? '',
          i.createdAt,
        ]),
      )
      filename = 'nori-inquiries.csv'
    } else if (exportType === 'vehicles') {
      const result = await payload.find({
        collection: 'vehicles',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 500,
        sort: 'reference',
      })
      csv = buildCsv(
        [
          'MaXe',
          'BienSo',
          'DongXe',
          'DichVu',
          'TrangThaiVanHanh',
          'TrangThaiKinhDoanh',
          'GiaThueNgayVND',
          'GiaBanVND',
          'ODO_km',
          'DuLieuDemo',
        ],
        result.docs.map((v) => [
          v.reference,
          v.licensePlate ?? '',
          typeof v.model === 'object' ? v.model?.name : '',
          v.intent,
          v.operationStatus ?? 'READY',
          v.status,
          v.pricePerDay ?? '',
          v.salePrice ?? '',
          v.odometer ?? '',
          v.isDemo ? 'DEMO' : 'THUC_TE',
        ]),
      )
      filename = 'nori-vehicles.csv'
    } else if (exportType === 'customers') {
      const result = await payload.find({
        collection: 'users',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        sort: '-createdAt',
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      })
      csv = buildCsv(
        ['MaKhach', 'HoTen', 'Email', 'SoDienThoai', 'TrangThai', 'NgayTao'],
        result.docs.map((u) => [
          u.id,
          u.fullName,
          u.email,
          u.phone ?? '',
          u.status ?? 'ACTIVE',
          u.createdAt,
        ]),
      )
      filename = 'nori-customers.csv'
    } else if (exportType === 'financial') {
      const result = await payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 500,
        sort: '-createdAt',
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      })
      const nameMap = await resolveCustomerDisplayNames(
        payload,
        result.docs.map((b) => (typeof b.customer === 'string' ? b.customer : '')).filter(Boolean),
      )
      csv = buildCsv(
        [
          'MaDon',
          'TrangThai',
          'KhachHang',
          'MaXe',
          'TienThueCoBanVND',
          'PhuPhiCuoiTuanVND',
          'PhiGiaoNhanVND',
          'DichVuBoSungVND',
          'ChietKhauVND',
          'PhuPhiPhatSinhVND',
          'TongDuKienVND',
          'TienCocDamBaoVND',
          'NgayTao',
        ],
        result.docs.map((b) => [
          b.bookingKey ?? b.id,
          b.status ?? 'PENDING',
          typeof b.customer === 'object'
            ? (b.customer?.fullName ?? '')
            : (nameMap.get(String(b.customer ?? ''))?.fullName ?? ''),
          b.vehicleReferenceSnapshot ?? '',
          b.baseRentPrice ?? 0,
          b.weekendSurchargeTotal ?? 0,
          b.deliveryFeeSnapshot ?? 0,
          b.addonFeeTotal ?? 0,
          b.discountAmount ?? 0,
          b.extraFee ?? 0,
          b.totalPrice ?? 0,
          b.depositSnapshot ?? 0,
          b.createdAt,
        ]),
      )
      filename = 'nori-financial.csv'
    } else {
      return fail('Loại dữ liệu xuất không hợp lệ.', 400, 'VALIDATION_ERROR')
    }

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return apiError(error)
  }
}

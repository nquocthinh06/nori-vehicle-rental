import { adminHasPermission, type AdminModule } from '@/access/nori'
import { assertBranchScopeOrFail, requireAdmin, resolveCustomerDisplayNames } from '@/lib/admin-api'
import { apiError, fail } from '@/lib/api-utils'
import { aggregateMultiBranchRevenue, computeBranchFleetStats } from '@/lib/multi-branch-rules'
import { relationId, roundVndInteger } from '@/lib/rental-rules'

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
      payments: 'payments',
      'branch-reports': 'reports',
    }
    const branchIdFilter = sp.get('branchId')?.trim() || ''
    if (branchIdFilter) {
      const deny = assertBranchScopeOrFail(admin, branchIdFilter)
      if (deny) return deny
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
      const docs = branchIdFilter
        ? result.docs.filter(
            (b) =>
              relationId(b.pickupBranch) === branchIdFilter ||
              relationId(b.returnBranch) === branchIdFilter,
          )
        : result.docs
      const nameMap = await resolveCustomerDisplayNames(
        payload,
        docs.map((b) => (typeof b.customer === 'string' ? b.customer : '')).filter(Boolean),
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
          'MotChieu',
          'TongTienThueVND',
          'TienCocVND',
          'NgayTao',
        ],
        docs.map((b) => [
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
          b.isOneWay ? 'CO' : 'KHONG',
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
      const docs = branchIdFilter
        ? result.docs.filter(
            (v) =>
              relationId(v.managingBranch) === branchIdFilter ||
              relationId(v.currentBranch) === branchIdFilter,
          )
        : result.docs
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
        docs.map((v) => [
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
      const [result, paymentsRes, refundsRes] = await Promise.all([
        payload.find({
          collection: 'bookings',
          user,
          overrideAccess: false,
          depth: 1,
          limit: 500,
          sort: '-createdAt',
          ...(createdAtFilter ? { where: createdAtFilter } : {}),
        }),
        payload.find({
          collection: 'payments',
          user,
          overrideAccess: false,
          depth: 0,
          limit: 1000,
        }),
        payload
          .find({
            collection: 'refunds',
            overrideAccess: true,
            depth: 0,
            limit: 1000,
          })
          .catch(() => ({ docs: [] })),
      ])
      const docs = branchIdFilter
        ? result.docs.filter(
            (b) =>
              relationId(b.pickupBranch) === branchIdFilter ||
              relationId(b.returnBranch) === branchIdFilter,
          )
        : result.docs
      const nameMap = await resolveCustomerDisplayNames(
        payload,
        docs.map((b) => (typeof b.customer === 'string' ? b.customer : '')).filter(Boolean),
      )
      const verifiedPaidByBooking = new Map<string, number>()
      const securityHeldByBooking = new Map<string, number>()
      for (const p of paymentsRes.docs) {
        const bId = typeof p.booking === 'object' && p.booking ? p.booking.id : p.booking
        if (!bId) continue
        if (['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status)) {
          const amt = Number(p.receivedAmount ?? p.amount ?? 0)
          if (p.paymentType === 'SECURITY_DEPOSIT') {
            securityHeldByBooking.set(
              String(bId),
              (securityHeldByBooking.get(String(bId)) ?? 0) + amt,
            )
          } else {
            verifiedPaidByBooking.set(
              String(bId),
              (verifiedPaidByBooking.get(String(bId)) ?? 0) + amt,
            )
          }
        }
      }
      const refundedByBooking = new Map<string, number>()
      for (const r of refundsRes.docs) {
        const bId = typeof r.booking === 'object' && r.booking ? r.booking.id : r.booking
        if (!bId) continue
        if (r.status === 'REFUNDED') {
          refundedByBooking.set(
            String(bId),
            (refundedByBooking.get(String(bId)) ?? 0) + Number(r.amount ?? 0),
          )
        }
      }
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
          'ThucThuTienThueVND',
          'CocBaoDamTaiSanThuVND',
          'DaHoanTienVND',
          'DoanhThuRongVND',
          'NgayTao',
        ],
        docs.map((b) => {
          const paidRent = verifiedPaidByBooking.get(String(b.id)) ?? 0
          const secHeld = securityHeldByBooking.get(String(b.id)) ?? 0
          const refunded = refundedByBooking.get(String(b.id)) ?? 0
          const netRev = Math.max(0, paidRent - refunded)
          return [
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
            paidRent,
            secHeld,
            refunded,
            netRev,
            b.createdAt,
          ]
        }),
      )
      filename = 'nori-financial.csv'
    } else if (exportType === 'payments') {
      const result = await payload.find({
        collection: 'payments',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 1000,
        sort: '-createdAt',
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      })
      const docs = branchIdFilter
        ? result.docs.filter((p) => relationId(p.branch) === branchIdFilter)
        : result.docs
      const nameMap = await resolveCustomerDisplayNames(
        payload,
        docs.map((p) => (typeof p.customer === 'string' ? p.customer : '')).filter(Boolean),
      )
      csv = buildCsv(
        [
          'MaGiaoDich',
          'MaDonThue',
          'KhachHang',
          'LoaiThanhToan',
          'PhuongThuc',
          'CongThanhToan',
          'MoiTruong',
          'SoTienYeuCauVND',
          'SoTienThucNhanVND',
          'SoTienDaHoanVND',
          'TrangThai',
          'TrangThaiDoiSoat',
          'MaThamChieuProvider',
          'MaGiaoDichNganHang',
          'ThoiGianThanhToan',
          'GhiChu',
          'NgayTao',
        ],
        docs.map((p) => [
          p.reference ?? p.id,
          typeof p.booking === 'object' && p.booking
            ? (p.booking.bookingKey ?? p.booking.id)
            : (p.booking ?? ''),
          typeof p.customer === 'object' && p.customer
            ? (p.customer.fullName ?? p.customer.email ?? '')
            : (nameMap.get(String(p.customer ?? ''))?.fullName ?? ''),
          p.paymentType,
          p.method,
          p.provider ?? 'MANUAL',
          p.environment ?? 'MOCK',
          p.expectedAmount ?? p.amount ?? 0,
          p.receivedAmount ?? 0,
          p.refundedAmount ?? 0,
          p.status,
          p.reconciliationStatus ?? 'NONE',
          p.providerPaymentRef ?? '',
          p.providerTransactionId ?? '',
          p.paidAt ?? '',
          p.note ?? '',
          p.createdAt,
        ]),
      )
      filename = 'nori-payments.csv'
    } else if (exportType === 'branch-reports') {
      const [branchesRes, vehiclesRes, bookingsRes, paymentsRes, transfersRes] = await Promise.all([
        payload.find({
          collection: 'branches',
          user,
          overrideAccess: false,
          depth: 0,
          limit: 200,
          sort: 'name',
        }),
        payload.find({
          collection: 'vehicles',
          user,
          overrideAccess: false,
          depth: 0,
          limit: 1000,
        }),
        payload.find({
          collection: 'bookings',
          user,
          overrideAccess: false,
          depth: 0,
          limit: 1000,
          ...(createdAtFilter ? { where: createdAtFilter } : {}),
        }),
        payload.find({
          collection: 'payments',
          user,
          overrideAccess: false,
          depth: 0,
          limit: 1000,
          ...(createdAtFilter ? { where: createdAtFilter } : {}),
        }),
        payload.find({
          collection: 'vehicle-transfers',
          user,
          overrideAccess: false,
          depth: 0,
          limit: 500,
          ...(createdAtFilter ? { where: createdAtFilter } : {}),
        }),
      ])
      const visibleBranches = branchesRes.docs.filter(
        (b) => !branchIdFilter || String(b.id) === branchIdFilter,
      )
      const invVehicles = vehiclesRes.docs.map((v) => ({
        id: String(v.id),
        managingBranchId: relationId(v.managingBranch) ?? null,
        currentBranchId: relationId(v.currentBranch) ?? null,
        currentWarehouseId: relationId(v.currentWarehouse) ?? null,
        operationStatus: String(v.operationStatus ?? 'READY'),
        status: String(v.status ?? 'ACTIVE'),
      }))
      const paidByBooking = new Map<string, number>()
      const secByBooking = new Map<string, number>()
      for (const p of paymentsRes.docs) {
        const bId = relationId(p.booking)
        if (!bId) continue
        if (['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(String(p.status))) {
          const amt = roundVndInteger(
            p.receivedAmount != null && Number(p.receivedAmount) > 0 ? p.receivedAmount : p.amount,
          )
          if (p.paymentType === 'SECURITY_DEPOSIT') {
            secByBooking.set(bId, (secByBooking.get(bId) ?? 0) + amt)
          } else if (p.paymentType !== 'REFUND') {
            paidByBooking.set(bId, (paidByBooking.get(bId) ?? 0) + amt)
          }
        }
      }
      const agg = aggregateMultiBranchRevenue({
        branchIds: visibleBranches.map((b) => String(b.id)),
        bookings: bookingsRes.docs.map((b) => ({
          id: String(b.id),
          status: String(b.status ?? 'PENDING'),
          pickupBranchId: relationId(b.pickupBranch) ?? null,
          returnBranchId: relationId(b.returnBranch) ?? null,
          revenueAttributionBranchId: relationId(b.revenueAttributionBranch) ?? null,
          revenueSplitPickupPercent: b.revenueSplitPickupPercent ?? 100,
          isOneWay: Boolean(b.isOneWay),
          deliveryRequested: Boolean(b.deliveryRequested),
          pickupMethod: b.pickupMethod ?? null,
          returnMethod: b.returnMethod ?? null,
          totalPrice: Number(b.totalPrice ?? 0),
          deliveryFeeSnapshot: Number(b.deliveryFeeSnapshot ?? 0),
          pickupFeeSnapshot: Number(b.pickupFeeSnapshot ?? 0),
          locationSurchargeSnapshot: Number(b.locationSurchargeSnapshot ?? 0),
          oneWayFeeSnapshot: Number(b.oneWayFeeSnapshot ?? 0),
          afterHoursFeeSnapshot: Number(b.afterHoursFeeSnapshot ?? 0),
          extraFee: Number(b.extraFee ?? 0),
          verifiedRentalCollected: paidByBooking.get(String(b.id)) ?? 0,
          securityDepositHeld: secByBooking.get(String(b.id)) ?? 0,
        })),
        transfers: transfersRes.docs.map((t) => ({
          fromBranchId: relationId(t.fromBranch) ?? '',
          toBranchId: relationId(t.toBranch) ?? '',
          status: String(t.status ?? 'DRAFT'),
          transferCost: Number(t.transferCost ?? 0),
        })),
      })
      csv = buildCsv(
        [
          'MaChiNhanh',
          'TenChiNhanh',
          'TrangThai',
          'XeQuanLy',
          'XeHienDienTaiKho',
          'XeSanSang',
          'XeDangChoThue',
          'XeDangDieuChuyen',
          'TongDonThue',
          'DonMotChieuDi',
          'DonMotChieuDen',
          'DonGiaoTanNoi',
          'DoanhThuThueXeVND',
          'DoanhThuGiaoNhanVND',
          'PhuPhiDiaDiemMotChieuVND',
          'ChiPhiDieuChuyenNoiBoVND',
          'CocBaoDamTaiSanVND',
          'DoanhThuRongVND',
        ],
        visibleBranches.map((b) => {
          const bId = String(b.id)
          const fl = computeBranchFleetStats(invVehicles, bId)
          const m = agg.byBranch[bId]
          return [
            b.code,
            b.name,
            b.status,
            fl.managedTotal,
            fl.physicallyPresentAtBranch,
            fl.readyForRent,
            fl.rented,
            fl.inTransit,
            m.totalBookings,
            m.oneWayOutboundCount,
            m.oneWayInboundCount,
            m.homeDeliveryCount,
            m.rentalRevenue,
            m.deliveryRevenue,
            m.locationSurchargeRevenue,
            m.transferCost,
            m.securityDepositHeld,
            m.netRevenue,
          ]
        }),
      )
      filename = 'nori-branch-reports.csv'
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

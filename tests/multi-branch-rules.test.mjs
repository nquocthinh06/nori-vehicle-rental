import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  adminBranchScope,
  adminCanAccessBranch,
  adminHasPermission,
  branchScopedWhere,
  canManageStaffAssignment,
  isAdminAccountActive,
  STAFF_ROLE_PERMISSION_PRESETS,
} from '../src/access/nori.ts'
import {
  aggregateMultiBranchRevenue,
  calculateMultiBranchRentalQuote,
  canTransitionDeliveryJob,
  canTransitionTransfer,
  computeBranchFleetStats,
  computeWarehouseOccupancy,
  evaluateVehicleLocationTimeline,
  hasDeliveryStaffTimeConflict,
  isPromotionEligibleForBranch,
  isTimeWithinWindow,
  matchOneWayRule,
  resolveLocationPricing,
  validateNonNegativeVnd,
} from '../src/lib/multi-branch-rules.ts'

describe('Module 3.7 Unit Tests — Branch RBAC & Security Guards (RB-01 .. RB-07)', () => {
  const superAdmin = {
    id: 'adm-super',
    collection: 'admins',
    adminRole: 'SUPER_ADMIN',
    staffTitle: 'SUPER_ADMIN',
    branchScopeMode: 'ALL',
    accountStatus: 'ACTIVE',
  }
  const branchAMgr = {
    id: 'adm-mgr-a',
    collection: 'admins',
    adminRole: 'OPERATOR',
    staffTitle: 'BRANCH_MANAGER',
    branchScopeMode: 'ASSIGNED',
    assignedBranchIds: ['br-a'],
    accountStatus: 'ACTIVE',
    permissions: STAFF_ROLE_PERMISSION_PRESETS.BRANCH_MANAGER,
  }
  const branchAStaff = {
    id: 'adm-staff-a',
    collection: 'admins',
    adminRole: 'OPERATOR',
    staffTitle: 'RENTAL_STAFF',
    branchScopeMode: 'ASSIGNED',
    assignedBranchIds: ['br-a'],
    accountStatus: 'ACTIVE',
    permissions: STAFF_ROLE_PERMISSION_PRESETS.RENTAL_STAFF,
  }
  const multiBranchStaff = {
    id: 'adm-multi',
    collection: 'admins',
    adminRole: 'OPERATOR',
    staffTitle: 'WAREHOUSE_STAFF',
    branchScopeMode: 'ASSIGNED',
    assignedBranchIds: ['br-a', 'br-b'],
    accountStatus: 'ACTIVE',
    permissions: STAFF_ROLE_PERMISSION_PRESETS.WAREHOUSE_STAFF,
  }
  const revokedStaff = {
    ...branchAStaff,
    id: 'adm-revoked',
    accountStatus: 'REVOKED',
  }

  it('RB-01/RB-02: Branch A staff accesses only Branch A, denied Branch B; multi-branch accesses A & B only', () => {
    assert.equal(adminCanAccessBranch(superAdmin, 'br-a'), true)
    assert.equal(adminCanAccessBranch(superAdmin, 'br-z'), true)
    assert.equal(adminCanAccessBranch(branchAStaff, 'br-a'), true)
    assert.equal(adminCanAccessBranch(branchAStaff, 'br-b'), false)
    assert.equal(adminCanAccessBranch(multiBranchStaff, 'br-a'), true)
    assert.equal(adminCanAccessBranch(multiBranchStaff, 'br-b'), true)
    assert.equal(adminCanAccessBranch(multiBranchStaff, 'br-c'), false)
  })

  it('RB-03: Branch Manager cannot create Super Admin or System Admin or assign outside own branch', () => {
    assert.equal(
      canManageStaffAssignment({
        actor: branchAMgr,
        targetStaffTitle: 'SUPER_ADMIN',
        targetBranchIds: ['br-a'],
      }).allowed,
      false,
    )
    assert.equal(
      canManageStaffAssignment({
        actor: branchAMgr,
        targetStaffTitle: 'SYSTEM_ADMIN',
        targetBranchIds: ['br-a'],
      }).allowed,
      false,
    )
    assert.equal(
      canManageStaffAssignment({
        actor: branchAMgr,
        targetStaffTitle: 'RENTAL_STAFF',
        targetBranchScopeMode: 'ALL',
        targetBranchIds: [],
      }).allowed,
      false,
    )
    assert.equal(
      canManageStaffAssignment({
        actor: branchAMgr,
        targetStaffTitle: 'RENTAL_STAFF',
        targetBranchIds: ['br-b'],
      }).allowed,
      false,
    )
    assert.equal(
      canManageStaffAssignment({
        actor: branchAMgr,
        targetAdminId: branchAMgr.id,
        targetStaffTitle: 'RENTAL_STAFF',
        targetBranchIds: ['br-a'],
      }).allowed,
      false,
    )
    assert.equal(
      canManageStaffAssignment({
        actor: branchAMgr,
        targetStaffTitle: 'RENTAL_STAFF',
        targetBranchIds: ['br-a'],
      }).allowed,
      true,
    )
    assert.equal(
      canManageStaffAssignment({
        actor: superAdmin,
        targetStaffTitle: 'SUPER_ADMIN',
        targetBranchIds: [],
      }).allowed,
      true,
    )
  })

  it('RB-04: Non-manager staff cannot create or elevate staff accounts', () => {
    assert.equal(
      canManageStaffAssignment({
        actor: branchAStaff,
        targetStaffTitle: 'RENTAL_STAFF',
        targetBranchIds: ['br-a'],
      }).allowed,
      false,
    )
    assert.equal(adminHasPermission(branchAStaff, 'staff', 'create'), false)
    assert.equal(adminHasPermission(branchAStaff, 'admins', 'update'), false)
  })

  it('RB-05: Revoked staff immediately loses active status, permissions, and branch scope', () => {
    assert.equal(isAdminAccountActive(revokedStaff), false)
    assert.equal(adminHasPermission(revokedStaff, 'bookings', 'read'), false)
    assert.equal(adminCanAccessBranch(revokedStaff, 'br-a'), false)
    assert.equal(branchScopedWhere(revokedStaff, ['pickupBranch']), false)
  })

  it('RB-06/RB-07: branchScopedWhere generates strict OR filter for assigned branches and false when unassigned', () => {
    const whereA = branchScopedWhere(branchAStaff, ['pickupBranch', 'returnBranch'])
    assert.deepEqual(whereA, {
      or: [{ pickupBranch: { in: ['br-a'] } }, { returnBranch: { in: ['br-a'] } }],
    })
    assert.equal(branchScopedWhere(superAdmin, ['pickupBranch']), true)
    const noBranch = { ...branchAStaff, assignedBranchIds: [] }
    assert.equal(adminBranchScope(noBranch).branchIds.length, 0)
    assert.equal(branchScopedWhere(noBranch, ['pickupBranch']), false)
  })
})

describe('Module 3.7 Unit Tests — Fleet & Warehouse Inventory (WH-01 .. WH-04)', () => {
  const fleet = [
    {
      id: 'v1',
      managingBranchId: 'br-a',
      currentBranchId: 'br-a',
      currentWarehouseId: 'wh-a1',
      operationStatus: 'READY',
      status: 'ACTIVE',
    },
    {
      id: 'v2',
      managingBranchId: 'br-a',
      currentBranchId: 'br-b',
      currentWarehouseId: 'wh-b1',
      operationStatus: 'READY',
      status: 'ACTIVE',
    },
    {
      id: 'v3',
      managingBranchId: 'br-a',
      currentBranchId: 'br-a',
      currentWarehouseId: null,
      operationStatus: 'IN_TRANSIT',
      status: 'ACTIVE',
    },
    {
      id: 'v4',
      managingBranchId: 'br-a',
      currentBranchId: 'br-a',
      currentWarehouseId: 'wh-a1',
      operationStatus: 'RENTED',
      status: 'ACTIVE',
    },
    {
      id: 'v5',
      managingBranchId: 'br-b',
      currentBranchId: 'br-b',
      currentWarehouseId: 'wh-b1',
      operationStatus: 'PENDING_INSPECTION',
      status: 'ACTIVE',
    },
    {
      id: 'v6',
      managingBranchId: null,
      currentBranchId: null,
      currentWarehouseId: null,
      operationStatus: 'READY',
      status: 'ACTIVE',
    },
  ]

  it('WH-01/WH-02: Distinguishes managingBranch vs currentBranch without double-counting or counting IN_TRANSIT/RENTED as physical stock', () => {
    const statsA = computeBranchFleetStats(fleet, 'br-a')
    assert.equal(statsA.managedTotal, 4) // v1, v2, v3, v4
    assert.equal(statsA.physicallyPresentAtBranch, 1) // only v1 (v2 at B, v3 IN_TRANSIT, v4 RENTED)
    assert.equal(statsA.awayAtOtherBranch, 1) // v2
    assert.equal(statsA.inTransit, 1) // v3
    assert.equal(statsA.rented, 1) // v4
    assert.equal(statsA.readyForRent, 2) // v1 + v2 managed READY

    const statsB = computeBranchFleetStats(fleet, 'br-b')
    assert.equal(statsB.managedTotal, 1) // v5
    assert.equal(statsB.physicallyPresentAtBranch, 2) // v2 visiting + v5
    assert.equal(statsB.visitingFromOtherBranch, 1) // v2
    assert.equal(statsB.pendingInspection, 1) // v5

    const sys = computeBranchFleetStats(fleet, null)
    assert.equal(sys.managedTotal, 6)
    assert.equal(sys.unallocatedTotal, 1)
  })

  it('WH-03/WH-04: Warehouse occupancy computes real physical slots excluding IN_TRANSIT and RENTED', () => {
    const occA1 = computeWarehouseOccupancy(fleet, 'wh-a1', 2)
    assert.equal(occA1.physicalCount, 1) // v1 only; v4 is RENTED
    assert.equal(occA1.availableSlots, 1)
    assert.equal(occA1.isOverCapacity, false)

    const occB1 = computeWarehouseOccupancy(fleet, 'wh-b1', 2)
    assert.equal(occB1.physicalCount, 2) // v2 + v5
    assert.equal(occB1.readyCount, 1) // v2 only; v5 is PENDING_INSPECTION
    assert.equal(occB1.availableSlots, 0)
  })
})

describe('Module 3.7 Unit Tests — Location Pricing & One-Way Rules (PR-01 .. PR-10)', () => {
  const rules = [
    {
      id: 'r-global',
      code: 'GLOBAL',
      name: 'Global',
      scopeType: 'GLOBAL_DEFAULT',
      dailyPrice: 500_000,
      weekendSurcharge: 50_000,
      depositAmount: 5_000_000,
      locationSurcharge: 0,
      priority: 100,
      active: true,
    },
    {
      id: 'r-br-a',
      code: 'BR-A',
      name: 'Branch A',
      scopeType: 'BRANCH_DEFAULT',
      branchId: 'br-a',
      dailyPrice: 650_000,
      locationSurcharge: 25_000,
      priority: 100,
      active: true,
    },
    {
      id: 'r-mod-b',
      code: 'MOD-B',
      name: 'Model @ B',
      scopeType: 'MODEL_BRANCH',
      branchId: 'br-b',
      vehicleModelId: 'mod-1',
      dailyPrice: 900_000,
      locationSurcharge: 40_000,
      priority: 100,
      active: true,
    },
    {
      id: 'r-veh-b',
      code: 'VEH-B',
      name: 'Veh1 @ B',
      scopeType: 'VEHICLE_BRANCH',
      branchId: 'br-b',
      vehicleId: 'veh-1',
      dailyPrice: 1_100_000,
      locationSurcharge: 0,
      priority: 100,
      active: true,
    },
  ]

  it('PR-01/PR-02: Enforces strict priority VEHICLE_BRANCH > MODEL_BRANCH > VEHICLE_BASE > BRANCH_DEFAULT > GLOBAL_DEFAULT', () => {
    const p1 = resolveLocationPricing({
      vehicleId: 'veh-1',
      vehicleModelId: 'mod-1',
      pickupBranchId: 'br-b',
      referenceDate: '2026-12-10',
      vehicleBase: { pricePerDay: 800_000 },
      rules,
    })
    assert.equal(p1.ok, true)
    assert.equal(p1.appliedRuleScope, 'VEHICLE_BRANCH')
    assert.equal(p1.dailyPrice, 1_100_000)

    const p2 = resolveLocationPricing({
      vehicleId: 'veh-2',
      vehicleModelId: 'mod-1',
      pickupBranchId: 'br-b',
      referenceDate: '2026-12-10',
      vehicleBase: { pricePerDay: 800_000 },
      rules,
    })
    assert.equal(p2.appliedRuleScope, 'MODEL_BRANCH')
    assert.equal(p2.dailyPrice, 900_000)

    const p3 = resolveLocationPricing({
      vehicleId: 'veh-3',
      vehicleModelId: 'mod-2',
      pickupBranchId: 'br-a',
      referenceDate: '2026-12-10',
      vehicleBase: { pricePerDay: 750_000 },
      rules,
    })
    assert.equal(p3.appliedRuleScope, 'VEHICLE_BASE')
    assert.equal(p3.dailyPrice, 750_000)

    const p4 = resolveLocationPricing({
      vehicleId: 'veh-4',
      vehicleModelId: 'mod-2',
      pickupBranchId: 'br-a',
      referenceDate: '2026-12-10',
      vehicleBase: { pricePerDay: null },
      rules,
    })
    assert.equal(p4.appliedRuleScope, 'BRANCH_DEFAULT')
    assert.equal(p4.dailyPrice, 650_000)
  })

  it('PR-09/PR-10: Never defaults missing price to 0; rejects negative VND; keeps deposit separate from rental total', () => {
    const missing = resolveLocationPricing({
      vehicleId: 'veh-x',
      vehicleModelId: 'mod-x',
      pickupBranchId: 'br-x',
      referenceDate: '2026-12-10',
      vehicleBase: { pricePerDay: null },
      rules: [],
    })
    assert.equal(missing.ok, false)
    assert.equal(validateNonNegativeVnd(-50000, 'Phí').valid, false)
    assert.equal(validateNonNegativeVnd(12.5, 'Phí').valid, false)
    assert.equal(validateNonNegativeVnd(0, 'Phí').valid, true)

    // PR-03: Same-branch rental NEVER adds oneWayFee even if passed
    const sameBranch = calculateMultiBranchRentalQuote({
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      dailyPrice: 1_000_000,
      isOneWay: false,
      oneWayFee: 500_000,
      locationSurcharge: 100_000,
      vehicleDeposit: 5_000_000,
    })
    assert.equal(sameBranch.oneWayFee, 0)
    assert.equal(sameBranch.estimatedTotal, 2_100_000)
    assert.equal(sameBranch.depositAmount, 5_000_000)
    assert.equal(sameBranch.remainingAmount, 2_100_000)

    // One-way rental adds exact oneWayFee
    const oneWay = calculateMultiBranchRentalQuote({
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      dailyPrice: 1_000_000,
      isOneWay: true,
      oneWayFee: 500_000,
      locationSurcharge: 100_000,
      deliveryRequested: true,
      deliveryFee: 150_000,
      pickupRequested: true,
      pickupFee: 150_000,
      afterHoursFee: 100_000,
      vehicleDeposit: 5_000_000,
    })
    assert.equal(oneWay.oneWayFee, 500_000)
    assert.equal(oneWay.estimatedTotal, 3_000_000)
  })

  it('PR-04/PR-05/PR-06: Branch-scoped promotions apply only to configured branches', () => {
    const promo = { branchScope: 'SPECIFIC_BRANCHES', applicableBranchIds: ['br-a'] }
    assert.equal(isPromotionEligibleForBranch(promo, 'br-a').eligible, true)
    assert.equal(isPromotionEligibleForBranch(promo, 'br-b').eligible, false)
    assert.equal(
      isPromotionEligibleForBranch({ branchScope: 'ALL_BRANCHES' }, 'br-b').eligible,
      true,
    )
  })
})

describe('Module 3.7 Unit Tests — P0 Chronological Vehicle Timeline Engine (BK-01 .. BK-12)', () => {
  const allowAB = matchOneWayRule(
    [
      {
        id: 'ow-ab',
        routeKey: 'br-a:br-b:ALL',
        fromBranchId: 'br-a',
        toBranchId: 'br-b',
        vehicleCategory: 'ALL',
        allowed: true,
        fee: 400_000,
        minRentalDays: 2,
        revenueSplitMode: 'PICKUP_BRANCH',
        pickupBranchSharePercent: 100,
        active: true,
      },
    ],
    'br-a',
    'br-b',
    'CAR',
  )

  it('BK-02/BK-03: Allows configured one-way route meeting minRentalDays, rejects disallowed or too-short one-way', () => {
    const ok = evaluateVehicleLocationTimeline({
      vehicleOperationStatus: 'READY',
      vehicleBusinessStatus: 'ACTIVE',
      currentBranchId: 'br-a',
      managingBranchId: 'br-a',
      startDate: '2026-12-10',
      endDate: '2026-12-12',
      requestedPickupBranchId: 'br-a',
      requestedReturnBranchId: 'br-b',
      pickupBranchStatus: 'ACTIVE',
      returnBranchStatus: 'ACTIVE',
      oneWayRule: allowAB,
      bookings: [],
      transfers: [],
      maintenances: [],
      today: '2026-12-01',
    })
    assert.equal(ok.available, true)

    const tooShort = evaluateVehicleLocationTimeline({
      vehicleOperationStatus: 'READY',
      vehicleBusinessStatus: 'ACTIVE',
      currentBranchId: 'br-a',
      managingBranchId: 'br-a',
      startDate: '2026-12-10',
      endDate: '2026-12-11',
      requestedPickupBranchId: 'br-a',
      requestedReturnBranchId: 'br-b',
      pickupBranchStatus: 'ACTIVE',
      returnBranchStatus: 'ACTIVE',
      oneWayRule: allowAB,
      bookings: [],
      transfers: [],
      maintenances: [],
      today: '2026-12-01',
    })
    assert.equal(tooShort.available, false)
    assert.equal(tooShort.reasonCode, 'ONE_WAY_MIN_DAYS_NOT_MET')

    const disallowed = evaluateVehicleLocationTimeline({
      vehicleOperationStatus: 'READY',
      vehicleBusinessStatus: 'ACTIVE',
      currentBranchId: 'br-a',
      managingBranchId: 'br-a',
      startDate: '2026-12-10',
      endDate: '2026-12-13',
      requestedPickupBranchId: 'br-a',
      requestedReturnBranchId: 'br-c',
      pickupBranchStatus: 'ACTIVE',
      returnBranchStatus: 'ACTIVE',
      oneWayRule: null,
      bookings: [],
      transfers: [],
      maintenances: [],
      today: '2026-12-01',
    })
    assert.equal(disallowed.available, false)
    assert.equal(disallowed.reasonCode, 'ONE_WAY_NOT_ALLOWED')
  })

  it('Section VIII / BK-12: Rejects Nov 24 pickup at Branch A when vehicle is scheduled to be returned at Branch B on Nov 23 without transfer', () => {
    const res = evaluateVehicleLocationTimeline({
      vehicleOperationStatus: 'READY',
      vehicleBusinessStatus: 'ACTIVE',
      currentBranchId: 'br-a',
      managingBranchId: 'br-a',
      startDate: '2026-11-24',
      endDate: '2026-11-26',
      requestedPickupBranchId: 'br-a',
      requestedReturnBranchId: 'br-a',
      pickupBranchStatus: 'ACTIVE',
      returnBranchStatus: 'ACTIVE',
      bookings: [
        {
          id: 'bk-1',
          bookingKey: 'NR-ONEWAY-1',
          startDate: '2026-11-21',
          endDate: '2026-11-23',
          status: 'CONFIRMED',
          pickupBranchId: 'br-a',
          returnBranchId: 'br-b',
        },
      ],
      transfers: [],
      maintenances: [],
      today: '2026-11-20',
    })
    assert.equal(res.available, false)
    assert.equal(res.reasonCode, 'LOCATION_MISMATCH_PROJECTED')
    assert.equal(res.projectedBranchOnStart, 'br-b')
  })

  it('Forward compatibility: Rejects one-way return to Branch B if next confirmed booking starts at Branch A without transfer', () => {
    const res = evaluateVehicleLocationTimeline({
      vehicleOperationStatus: 'READY',
      vehicleBusinessStatus: 'ACTIVE',
      currentBranchId: 'br-a',
      managingBranchId: 'br-a',
      startDate: '2026-12-05',
      endDate: '2026-12-07',
      requestedPickupBranchId: 'br-a',
      requestedReturnBranchId: 'br-b',
      pickupBranchStatus: 'ACTIVE',
      returnBranchStatus: 'ACTIVE',
      oneWayRule: allowAB,
      bookings: [
        {
          id: 'bk-next',
          bookingKey: 'NR-NEXT-A',
          startDate: '2026-12-09',
          endDate: '2026-12-11',
          status: 'CONFIRMED',
          pickupBranchId: 'br-a',
          returnBranchId: 'br-a',
        },
      ],
      transfers: [],
      maintenances: [],
      today: '2026-12-01',
    })
    assert.equal(res.available, false)
    assert.equal(res.reasonCode, 'NEXT_BOOKING_LOCATION_CONFLICT')
  })

  it('BR-05: Rejects pickup or return when branch is TEMPORARILY_CLOSED or INACTIVE', () => {
    const res = evaluateVehicleLocationTimeline({
      vehicleOperationStatus: 'READY',
      vehicleBusinessStatus: 'ACTIVE',
      currentBranchId: 'br-a',
      managingBranchId: 'br-a',
      startDate: '2026-12-05',
      endDate: '2026-12-07',
      requestedPickupBranchId: 'br-a',
      requestedReturnBranchId: 'br-a',
      pickupBranchStatus: 'TEMPORARILY_CLOSED',
      returnBranchStatus: 'TEMPORARILY_CLOSED',
      bookings: [],
      transfers: [],
      maintenances: [],
      today: '2026-12-01',
    })
    assert.equal(res.available, false)
    assert.equal(res.reasonCode, 'PICKUP_BRANCH_INACTIVE')
  })
})

describe('Module 3.7 Unit Tests — Transfer & Delivery State Machines + Revenue Attribution', () => {
  it('TR-08/TR-10: Blocks cancel after IN_TRANSIT departure and blocks double-complete', () => {
    assert.equal(canTransitionTransfer('IN_TRANSIT', 'CANCELLED', 'SUPER_ADMIN').allowed, false)
    assert.equal(canTransitionTransfer('COMPLETED', 'COMPLETED', 'SUPER_ADMIN').allowed, false)
    assert.equal(canTransitionTransfer('COMPLETED', 'ARRIVED', 'SUPER_ADMIN').allowed, false)
    assert.equal(
      canTransitionTransfer('PENDING_APPROVAL', 'APPROVED', 'WAREHOUSE_STAFF').allowed,
      false,
    )
    assert.equal(
      canTransitionTransfer('PENDING_APPROVAL', 'APPROVED', 'BRANCH_MANAGER').allowed,
      true,
    )
    assert.equal(canTransitionTransfer('IN_TRANSIT', 'EXCEPTION', 'WAREHOUSE_STAFF').allowed, true)
  })

  it('DL-05/DL-06: Detects overlapping delivery staff time slots and checks operating windows', () => {
    assert.equal(isTimeWithinWindow('09:30', '08:00', '20:00'), true)
    assert.equal(isTimeWithinWindow('22:00', '08:00', '20:00'), false)
    assert.equal(canTransitionDeliveryJob('ASSIGNED', 'EN_ROUTE').allowed, true)
    assert.equal(canTransitionDeliveryJob('COMPLETED', 'FAILED').allowed, false)

    const existing = [
      {
        id: 'j1',
        assignedStaffId: 'st-1',
        scheduledDate: '2026-12-10',
        scheduledTime: '09:00',
        estimatedDurationMinutes: 60,
        status: 'ASSIGNED',
      },
    ]
    assert.equal(
      hasDeliveryStaffTimeConflict(existing, {
        staffId: 'st-1',
        scheduledDate: '2026-12-10',
        scheduledTime: '09:30',
        estimatedDurationMinutes: 60,
      }).conflict,
      true,
    )
    assert.equal(
      hasDeliveryStaffTimeConflict(existing, {
        staffId: 'st-1',
        scheduledDate: '2026-12-10',
        scheduledTime: '10:30',
        estimatedDurationMinutes: 60,
      }).conflict,
      false,
    )
  })

  it('RP-01/RP-02: Zero revenue double-counting on one-way bookings (SUM(branch) === systemTotal) and isolates deposits & transfer costs', () => {
    const agg = aggregateMultiBranchRevenue({
      branchIds: ['br-a', 'br-b'],
      bookings: [
        // Same-branch A: 2,000,000 rental + 150,000 delivery, 5,000,000 security deposit
        {
          id: 'b1',
          status: 'COMPLETED',
          pickupBranchId: 'br-a',
          returnBranchId: 'br-a',
          totalPrice: 2_150_000,
          deliveryFeeSnapshot: 150_000,
          verifiedRentalCollected: 2_150_000,
          securityDepositHeld: 5_000_000,
        },
        // One-way A -> B: 3,000,000 total (500,000 one-way fee), split 70/30
        {
          id: 'b2',
          status: 'COMPLETED',
          pickupBranchId: 'br-a',
          returnBranchId: 'br-b',
          isOneWay: true,
          revenueSplitPickupPercent: 70,
          totalPrice: 3_000_000,
          oneWayFeeSnapshot: 500_000,
          verifiedRentalCollected: 3_000_000,
        },
      ],
      transfers: [
        { fromBranchId: 'br-b', toBranchId: 'br-a', status: 'COMPLETED', transferCost: 350_000 },
      ],
    })

    const sumNet = agg.byBranch['br-a'].netRevenue + agg.byBranch['br-b'].netRevenue
    const sumRental = agg.byBranch['br-a'].rentalRevenue + agg.byBranch['br-b'].rentalRevenue
    const sumSurcharge =
      agg.byBranch['br-a'].locationSurchargeRevenue + agg.byBranch['br-b'].locationSurchargeRevenue

    assert.equal(sumNet, agg.systemTotal.netRevenue)
    assert.equal(sumNet, 5_150_000)
    assert.equal(sumRental, agg.systemTotal.rentalRevenue)
    assert.equal(sumSurcharge, agg.systemTotal.locationSurchargeRevenue)
    assert.equal(agg.byBranch['br-a'].oneWayOutboundCount, 1)
    assert.equal(agg.byBranch['br-b'].oneWayInboundCount, 1)
    // Security deposit is NOT included in netRevenue!
    assert.equal(agg.systemTotal.securityDepositHeld, 5_000_000)
    // Transfer cost tracked separately!
    assert.equal(agg.byBranch['br-b'].transferCost, 350_000)
    assert.equal(agg.systemTotal.transferCost, 350_000)
  })
})

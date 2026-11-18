import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ADMIN_MODULES,
  DEFAULT_OPERATOR_PERMISSIONS,
  adminField,
  adminHasAnyPermission,
  adminHasPermission,
  adminMediaDeleteAccess,
  adminMediaWriteAccess,
  adminPermission,
  adminRoleOf,
  customerOnly,
  isAdmin,
  isSuperAdmin,
  ownAccount,
  ownRecords,
  resolveAdminPermissions,
  serverField,
  superAdminField,
} from '../src/access/nori.ts'
import { dispatchBookingConfirmationNotice } from '../src/lib/notifications.ts'

test('adminRoleOf distinguishes unauthenticated, customers, operators, and super admins', () => {
  assert.equal(adminRoleOf(null), null)
  assert.equal(adminRoleOf(undefined), null)
  assert.equal(adminRoleOf({ collection: 'users', status: 'ACTIVE' }), null)
  assert.equal(adminRoleOf({ collection: 'admins' }), 'OPERATOR')
  assert.equal(adminRoleOf({ collection: 'admins', adminRole: 'OPERATOR' }), 'OPERATOR')
  assert.equal(adminRoleOf({ collection: 'admins', adminRole: 'SUPER_ADMIN' }), 'SUPER_ADMIN')
})

test('resolveAdminPermissions grants all 5 actions including publish to SUPER_ADMIN and falls back safely for OPERATOR', () => {
  const superPerms = resolveAdminPermissions({ collection: 'admins', adminRole: 'SUPER_ADMIN' })
  for (const mod of ADMIN_MODULES) {
    assert.deepEqual(superPerms[mod], ['read', 'create', 'update', 'delete', 'publish'])
  }

  const fallbackOp = resolveAdminPermissions({
    collection: 'admins',
    adminRole: 'OPERATOR',
    permissions: null,
  })
  assert.deepEqual(fallbackOp, DEFAULT_OPERATOR_PERMISSIONS)
  assert.equal(
    adminHasPermission({ collection: 'admins', adminRole: 'OPERATOR' }, 'posts', 'publish'),
    false,
  )
  assert.equal(
    adminHasPermission({ collection: 'admins', adminRole: 'OPERATOR' }, 'content', 'publish'),
    false,
  )
  assert.equal(
    adminHasPermission({ collection: 'admins', adminRole: 'OPERATOR' }, 'admins', 'read'),
    false,
  )
})

test('adminHasPermission and adminHasAnyPermission enforce custom operator permissions including publish', () => {
  const limitedOperator = {
    collection: 'admins',
    adminRole: 'OPERATOR',
    permissions: {
      vehicles: ['read'],
      posts: ['read', 'create', 'update'],
      content: ['read', 'update'],
      admins: [],
    },
  }

  assert.equal(adminHasPermission(limitedOperator, 'vehicles', 'read'), true)
  assert.equal(adminHasPermission(limitedOperator, 'vehicles', 'update'), false)
  assert.equal(adminHasPermission(limitedOperator, 'posts', 'update'), true)
  assert.equal(adminHasPermission(limitedOperator, 'posts', 'publish'), false)
  assert.equal(adminHasPermission(limitedOperator, 'content', 'publish'), false)
  assert.equal(
    adminHasAnyPermission(limitedOperator, [
      ['posts', 'publish'],
      ['content', 'publish'],
    ]),
    false,
  )
  assert.equal(
    adminHasAnyPermission(limitedOperator, [
      ['posts', 'publish'],
      ['posts', 'update'],
    ]),
    true,
  )

  const publisherOperator = {
    collection: 'admins',
    adminRole: 'OPERATOR',
    permissions: {
      posts: ['read', 'publish'],
      content: ['read', 'publish'],
    },
  }
  assert.equal(adminHasPermission(publisherOperator, 'posts', 'publish'), true)
  assert.equal(adminHasPermission(publisherOperator, 'content', 'publish'), true)
})

test('adminMediaWriteAccess and adminMediaDeleteAccess map module permissions accurately', () => {
  const viewerOnly = {
    collection: 'admins',
    adminRole: 'OPERATOR',
    permissions: { vehicles: ['read'], posts: ['read'], content: ['read'], models: ['read'] },
  }
  assert.equal(adminMediaWriteAccess({ user: viewerOnly }), false)
  assert.equal(adminMediaDeleteAccess({ user: viewerOnly }), false)

  const editor = {
    collection: 'admins',
    adminRole: 'OPERATOR',
    permissions: { posts: ['read', 'create'] },
  }
  assert.equal(adminMediaWriteAccess({ user: editor }), true)
  assert.equal(adminMediaDeleteAccess({ user: editor }), false)

  const updater = {
    collection: 'admins',
    adminRole: 'OPERATOR',
    permissions: { content: ['read', 'update'] },
  }
  assert.equal(adminMediaWriteAccess({ user: updater }), true)
  assert.equal(adminMediaDeleteAccess({ user: updater }), true)
})

test('Access and FieldAccess helpers block customers, disabled customers, and non-admins appropriately', () => {
  const guestReq = { req: { user: null } }
  const activeCustomerReq = {
    req: { user: { id: 'cust-1', collection: 'users', status: 'ACTIVE' } },
  }
  const disabledCustomerReq = {
    req: { user: { id: 'cust-2', collection: 'users', status: 'DISABLED' } },
  }
  const operatorReq = {
    req: {
      user: {
        id: 'adm-1',
        collection: 'admins',
        adminRole: 'OPERATOR',
        permissions: { bookings: ['read'] },
      },
    },
  }
  const superReq = {
    req: { user: { id: 'adm-2', collection: 'admins', adminRole: 'SUPER_ADMIN' } },
  }

  assert.equal(isAdmin(guestReq), false)
  assert.equal(isAdmin(activeCustomerReq), false)
  assert.equal(isAdmin(operatorReq), true)
  assert.equal(isSuperAdmin(operatorReq), false)
  assert.equal(isSuperAdmin(superReq), true)

  assert.equal(customerOnly(guestReq), false)
  assert.equal(customerOnly(disabledCustomerReq), false)
  assert.equal(customerOnly(operatorReq), false)
  assert.equal(customerOnly(activeCustomerReq), true)

  assert.equal(ownAccount(guestReq), false)
  assert.equal(ownAccount(disabledCustomerReq), false)
  assert.deepEqual(ownAccount(activeCustomerReq), { id: { equals: 'cust-1' } })
  assert.equal(ownRecords(disabledCustomerReq), false)
  assert.deepEqual(ownRecords(activeCustomerReq), { customer: { equals: 'cust-1' } })

  assert.equal(adminField(activeCustomerReq), false)
  assert.equal(adminField(operatorReq), true)
  assert.equal(superAdminField(operatorReq), false)
  assert.equal(superAdminField(superReq), true)
  assert.equal(serverField(superReq), false)

  const bookingsCreate = adminPermission('bookings', 'create')
  const bookingsRead = adminPermission('bookings', 'read')
  assert.equal(bookingsCreate(operatorReq), false)
  assert.equal(bookingsRead(operatorReq), true)
  assert.equal(bookingsCreate(superReq), true)
})

test('dispatchBookingConfirmationNotice degrades gracefully when in-app notification or webhook fails', async () => {
  const sampleData = {
    eventKey: 'booking:confirm:test-1',
    customerId: 'cust-1',
    bookingId: 'bkg-1',
    title: 'Đặt xe thành công',
    message: 'Đơn đã được duyệt',
    bookingKey: 'NR-TEST-01',
    vehicleName: 'Toyota Fortuner',
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    pickupTime: '08:00',
    returnTime: '18:00',
    expectedContactDate: '2026-11-30',
    workingHoursLabel: '08:00 - 20:00',
    customerPhoneMasked: '090***1234',
    hotline: '1900 1234',
    isUrgent: false,
    paymentConfirmed: false,
  }

  const prevWebhook = process.env.NORI_NOTIFY_WEBHOOK_URL
  try {
    delete process.env.NORI_NOTIFY_WEBHOOK_URL
    const failingPayload = {
      async create() {
        throw new Error('Simulated DB notification failure')
      },
    }

    const res1 = await dispatchBookingConfirmationNotice({
      payload: failingPayload,
      existingNotifCount: 0,
      data: sampleData,
    })
    assert.deepEqual(res1, {
      inAppSaved: false,
      externalChannel: 'NONE',
      externalStatus: 'NOT_CONFIGURED',
    })

    process.env.NORI_NOTIFY_WEBHOOK_URL = 'http://127.0.0.1:1/unreachable-webhook'
    const okPayload = {
      async create() {
        return { id: 'notif-1' }
      },
    }

    const res2 = await dispatchBookingConfirmationNotice({
      payload: okPayload,
      existingNotifCount: 0,
      data: sampleData,
    })
    assert.deepEqual(res2, {
      inAppSaved: true,
      externalChannel: 'WEBHOOK',
      externalStatus: 'DEGRADED',
    })
  } finally {
    if (prevWebhook === undefined) {
      delete process.env.NORI_NOTIFY_WEBHOOK_URL
    } else {
      process.env.NORI_NOTIFY_WEBHOOK_URL = prevWebhook
    }
  }
})

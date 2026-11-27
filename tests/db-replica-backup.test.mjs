import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import pg from 'pg'
import {
  applyBackupRetention,
  createEncryptedPgBackup,
  decryptGzipFile,
  encryptGzipFile,
  resolvePgBinDir,
  restoreEncryptedPgBackup,
  verifyEncryptedPgBackup,
} from '../src/lib/pg-backup.ts'
import {
  applyPostgresMigrationsDirect,
  assertNotProductionTarget,
  buildSlotReinitRunbook,
  compareSourceAndReplicaParity,
  inspectPostgresEndpoint,
  redactPostgresUrl,
  refreshSubscriptionSafe,
  resolveNeonDirectUrl,
  verifyReadOnlyRoleAccess,
} from '../src/lib/pg-replication.ts'

const BINS = resolvePgBinDir()
const HAS_PG_BIN = fs.existsSync(BINS.initdb) && fs.existsSync(BINS.pgCtl)

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

function runBin(binPath, args, opts = {}) {
  const res = spawnSync(binPath, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
  })
  if (res.status !== 0) {
    throw new Error(
      `${path.basename(binPath)} ${args.join(' ')} failed (${res.status}): ${res.stderr || res.stdout}`,
    )
  }
  return res.stdout || ''
}

function startCluster(dataDir) {
  // stdio:'ignore' is mandatory on Windows so background postgres.exe daemons do not hold Node pipe FDs open.
  const res = spawnSync(
    BINS.pgCtl,
    ['-D', dataDir, '-l', path.join(dataDir, 'pg.log'), '-t', '120', '-w', 'start'],
    { stdio: 'ignore', encoding: 'utf8' },
  )
  if (res.status !== 0) {
    const log = fs.existsSync(path.join(dataDir, 'pg.log'))
      ? fs.readFileSync(path.join(dataDir, 'pg.log'), 'utf8')
      : ''
    throw new Error(`pg_ctl start failed (${res.status}): ${log}`)
  }
}

function stopCluster(dataDir, mode = 'immediate') {
  if (!fs.existsSync(path.join(dataDir, 'postmaster.pid'))) return
  spawnSync(BINS.pgCtl, ['-D', dataDir, '-m', mode, '-t', '120', '-w', 'stop'], {
    stdio: 'ignore',
    encoding: 'utf8',
  })
}

function initCluster(dataDir, port, confLines) {
  fs.mkdirSync(dataDir, { recursive: true })
  runBin(BINS.initdb, [
    '-D',
    dataDir,
    '-U',
    'postgres',
    '-A',
    'trust',
    '--encoding=UTF8',
    '--locale=C',
  ])
  fs.appendFileSync(
    path.join(dataDir, 'postgresql.conf'),
    `\nport = ${port}\nlisten_addresses = '127.0.0.1'\n${confLines.join('\n')}\n`,
    'utf8',
  )
  startCluster(dataDir)
}

async function waitForCondition(fn, timeoutMs = 15000, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const val = await fn()
      if (val) return val
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for condition${lastErr ? `: ${lastErr.message}` : ''}`,
  )
}

test('DB-19: resolveNeonDirectUrl strips -pooler & enforces verify-full TLS without leaking secrets', () => {
  const res = resolveNeonDirectUrl(
    'postgresql://neondb_owner:superSecretPass@ep-plain-scene-bigtb31p-pooler.c-5.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  )
  assert.equal(res.convertedFromPooler, true)
  assert.equal(res.poolerHost, 'ep-plain-scene-bigtb31p-pooler.c-5.ap-southeast-1.aws.neon.tech')
  assert.equal(res.directHost, 'ep-plain-scene-bigtb31p.c-5.ap-southeast-1.aws.neon.tech')
  assert.ok(res.directUrl.includes('sslmode=verify-full'))

  const redacted = redactPostgresUrl(res.directUrl)
  assert.ok(!redacted.includes('superSecretPass'))
  assert.ok(redacted.includes('***@'))
})

test('DB-18: production target guard blocks remote mutations without explicit confirmation', () => {
  assert.throws(
    () =>
      assertNotProductionTarget(
        'postgresql://user:pass@ep-prod-123.ap-southeast-1.aws.neon.tech/neondb',
        'pg_restore',
      ),
    /PG-SAFETY-GUARD/,
  )
  assert.doesNotThrow(() =>
    assertNotProductionTarget('postgresql://postgres@127.0.0.1:5432/nori_replica', 'pg_restore'),
  )
})

test('DB-14: backup retention policy enforces 30d daily / 12w weekly / 12m monthly & preserves newest', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-retention-'))
  try {
    const makeFakeBundle = (tier, idx) => {
      const ts = new Date(Date.UTC(2026, 0, 1 + idx)).toISOString()
      const id = `nori-pg-${tier}-${String(idx).padStart(3, '0')}`
      const dir = path.join(tmpRoot, id)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'backup-manifest.json'),
        JSON.stringify({ backupId: id, tier, createdAt: ts }),
      )
      return id
    }

    for (let i = 0; i < 35; i++) makeFakeBundle('daily', i)
    for (let i = 0; i < 14; i++) makeFakeBundle('weekly', 40 + i)
    for (let i = 0; i < 14; i++) makeFakeBundle('monthly', 60 + i)

    const pruned = applyBackupRetention(tmpRoot, { daily: 30, weekly: 12, monthly: 12 })
    assert.equal(pruned.length, 9)

    const remainingDirs = fs.readdirSync(tmpRoot)
    assert.equal(remainingDirs.filter((d) => d.includes('-daily-')).length, 30)
    assert.equal(remainingDirs.filter((d) => d.includes('-weekly-')).length, 12)
    assert.equal(remainingDirs.filter((d) => d.includes('-monthly-')).length, 12)
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('DB-11/DB-13 (unit): AES-256-GCM encrypt/decrypt roundtrip and tamper/wrong-key rejection', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-enc-unit-'))
  try {
    const srcPath = path.join(tmpRoot, 'sample.pgdump')
    const encPath = path.join(tmpRoot, 'sample.pgdump.gz.enc')
    const decPath = path.join(tmpRoot, 'sample.dec.pgdump')
    const payload = Buffer.from('NORI-PG-CUSTOM-DUMP-TEST-PAYLOAD-2026', 'utf8')
    fs.writeFileSync(srcPath, payload)

    const encRes = encryptGzipFile(srcPath, encPath, 'nori-unit-passphrase-2026')
    assert.equal(encRes.encrypted, true)
    const encBytes = fs.readFileSync(encPath)
    assert.equal(encBytes.subarray(0, 8).toString('ascii'), 'NORIENC1')
    assert.ok(!encBytes.includes(payload))

    decryptGzipFile(encPath, decPath, 'nori-unit-passphrase-2026')
    assert.deepEqual(fs.readFileSync(decPath), payload)

    assert.throws(() => decryptGzipFile(encPath, decPath, 'wrong-passphrase-2026'))

    encBytes[encBytes.length - 10] ^= 0xff
    fs.writeFileSync(encPath, encBytes)
    assert.throws(() => decryptGzipFile(encPath, decPath, 'nori-unit-passphrase-2026'))
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('DB-16: media-backup creates incremental SHA-256 manifest, detects tampering, and restores cleanly', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-media-bkp-'))
  try {
    const mediaDir = path.join(tmpRoot, 'media')
    const outDir = path.join(tmpRoot, 'backups-media')
    const restoreDir = path.join(tmpRoot, 'restored-media')
    fs.mkdirSync(mediaDir, { recursive: true })

    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
    const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
    fs.writeFileSync(path.join(mediaDir, 'car.png'), pngBytes)
    fs.writeFileSync(path.join(mediaDir, 'bike.jpg'), jpgBytes)

    const first = JSON.parse(
      runBin(process.execPath, [
        'scripts/media-backup.mjs',
        '--media',
        mediaDir,
        '--out-dir',
        outDir,
        '--json',
      ]),
    )
    assert.equal(first.ok, true)
    assert.equal(first.copied, 2)
    assert.equal(first.skippedUnchanged, 0)

    const second = JSON.parse(
      runBin(process.execPath, [
        'scripts/media-backup.mjs',
        '--media',
        mediaDir,
        '--out-dir',
        outDir,
        '--json',
      ]),
    )
    assert.equal(second.ok, true)
    assert.equal(second.copied, 0)
    assert.equal(second.skippedUnchanged, 2)

    const verified = JSON.parse(
      runBin(process.execPath, [
        'scripts/media-backup.mjs',
        '--verify',
        '--out-dir',
        outDir,
        '--json',
      ]),
    )
    assert.equal(verified.ok, true)
    assert.equal(verified.checked, 2)

    const restored = JSON.parse(
      runBin(process.execPath, [
        'scripts/media-backup.mjs',
        '--restore',
        '--to',
        restoreDir,
        '--out-dir',
        outDir,
        '--json',
      ]),
    )
    assert.equal(restored.ok, true)
    assert.equal(restored.restoredFiles, 2)
    assert.deepEqual(fs.readFileSync(path.join(restoreDir, 'car.png')), pngBytes)

    fs.writeFileSync(path.join(outDir, 'files', 'car.png'), Buffer.from('corrupted'))
    const tamperRes = spawnSync(
      process.execPath,
      ['scripts/media-backup.mjs', '--verify', '--out-dir', outDir, '--json'],
      { encoding: 'utf8' },
    )
    assert.notEqual(tamperRes.status, 0)
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test(
  'DB-01..DB-22: Disposable PostgreSQL 18 Logical Replication, ReadOnly Role & Encrypted Backup/Restore Suite',
  { skip: !HAS_PG_BIN ? 'PostgreSQL 18 initdb/pg_ctl binaries not installed' : false },
  async (t) => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-pg18-repl-'))
    const pubDir = path.join(workRoot, 'pub')
    const subDir = path.join(workRoot, 'sub')
    const backupOutDir = path.join(workRoot, 'pg-backups')
    const prevKey = process.env.NORI_BACKUP_ENCRYPTION_KEY
    process.env.NORI_BACKUP_ENCRYPTION_KEY = 'nori-test-aes-256-gcm-key-2026-secure'

    let pubPort = 0
    let subPort = 0
    let pubUrl = ''
    let subReplicaUrl = ''
    let subIsolatedRestoreUrl = ''
    let pubPool = null
    let subPool = null

    try {
      pubPort = await getFreePort()
      subPort = await getFreePort()

      initCluster(pubDir, pubPort, [
        'wal_level = logical',
        'max_replication_slots = 10',
        'max_wal_senders = 10',
      ])
      initCluster(subDir, subPort, [
        'wal_level = replica',
        'max_logical_replication_workers = 8',
        'max_sync_workers_per_subscription = 4',
        'max_worker_processes = 12',
      ])

      const pubAdminUrl = `postgresql://postgres@127.0.0.1:${pubPort}/postgres`
      const subAdminUrl = `postgresql://postgres@127.0.0.1:${subPort}/postgres`
      pubUrl = `postgresql://postgres@127.0.0.1:${pubPort}/neondb_sim`
      subReplicaUrl = `postgresql://postgres@127.0.0.1:${subPort}/nori_replica`
      subIsolatedRestoreUrl = `postgresql://postgres@127.0.0.1:${subPort}/nori_restore_isolated`

      const pubAdmin = new pg.Client({ connectionString: pubAdminUrl })
      await pubAdmin.connect()
      await pubAdmin.query('CREATE DATABASE neondb_sim')
      await pubAdmin.end()

      const subAdmin = new pg.Client({ connectionString: subAdminUrl })
      await subAdmin.connect()
      await subAdmin.query('CREATE DATABASE nori_restore_isolated')
      await subAdmin.end()

      const setupOut = JSON.parse(
        runBin(process.execPath, [
          'scripts/pg-local-setup.mjs',
          '--admin-url',
          subAdminUrl,
          '--readonly-password',
          'ro_test_pass_2026',
          '--json',
        ]),
      )
      assert.equal(setupOut.ok, true)
      assert.ok(setupOut.databases.replica.totalTables >= 116)

      const pubMig = await applyPostgresMigrationsDirect(pubUrl)
      assert.ok(pubMig.totalTables >= 116)

      pubPool = new pg.Pool({ connectionString: pubUrl })
      subPool = new pg.Pool({ connectionString: subReplicaUrl })

      const branchId = crypto.randomUUID()
      const userId = crypto.randomUUID()
      const modelId = crypto.randomUUID()
      const vehicleId = crypto.randomUUID()
      const bookingId = crypto.randomUUID()
      const paymentId = crypto.randomUUID()
      const notifId = crypto.randomUUID()

      await pubPool.query(
        "INSERT INTO branches (id, code, name, address, province, status) VALUES ($1, 'HCM-01', 'NORI Saigon', '123 Le Loi', 'TP.HCM', 'ACTIVE')",
        [branchId],
      )
      await pubPool.query(
        "INSERT INTO users (id, email, full_name, status) VALUES ($1, 'alice@nori.vn', 'Alice Nguyen', 'ACTIVE')",
        [userId],
      )
      await pubPool.query(
        "INSERT INTO vehicle_models (id, slug, name, brand, category, reference_rent_price, verification_status) VALUES ($1, 'toyota-fortuner', 'Toyota Fortuner', 'Toyota', 'CAR', 1200000, 'VERIFIED')",
        [modelId],
      )
      await pubPool.query(
        "INSERT INTO vehicles (id, reference, model_id, license_plate, status, operation_status, managing_branch_id, current_branch_id) VALUES ($1, 'NORI-CAR-01', $2, '51A-99999', 'ACTIVE', 'READY', $3, $3)",
        [vehicleId, modelId, branchId],
      )
      await pubPool.query(
        "INSERT INTO bookings (id, booking_key, customer_id, vehicle_id, start_date, end_date, total_price, status, pickup_branch_id, return_branch_id) VALUES ($1, 'BK-1001', $2, $3, '2026-12-01', '2026-12-03', 2400000, 'PENDING', $4, $4)",
        [bookingId, userId, vehicleId, branchId],
      )
      await pubPool.query(
        "INSERT INTO payments (id, booking_id, payment_type, amount, status, provider, environment) VALUES ($1, $2, 'DEPOSIT', 500000, 'PENDING', 'SEPAY', 'SANDBOX')",
        [paymentId, bookingId],
      )
      await pubPool.query(
        "INSERT INTO nori_site (id, site_name) VALUES (gen_random_uuid(), 'NORI Vehicle Rental')",
      )
      await pubPool.query(
        "INSERT INTO bookings_rels (parent_id, path, users_id) VALUES ($1, 'customer', $2)",
        [bookingId, userId],
      )

      await t.test(
        'DB-01: Initial schema & Logical Replication subscription copy_data=true',
        async () => {
          await subPool.query('TRUNCATE TABLE payload_migrations')
          await pubPool.query('CREATE PUBLICATION nori_pub FOR ALL TABLES')
          await subPool.query(
            `CREATE SUBSCRIPTION nori_sub CONNECTION 'host=127.0.0.1 port=${pubPort} dbname=neondb_sim user=postgres' PUBLICATION nori_pub WITH (copy_data = true, create_slot = true, slot_name = 'nori_sub_slot', enabled = true)`,
          )
          await waitForCondition(async () => {
            const b = await subPool.query('SELECT count(*)::int AS c FROM bookings')
            const rel = await subPool.query(
              "SELECT count(*)::int AS pending FROM pg_subscription_rel WHERE srsubstate <> 'r'",
            )
            return b.rows[0].c === 1 && rel.rows[0].pending === 0
          }, 45000)
        },
      )

      await t.test('DB-02: INSERT replication across bookings/notifications', async () => {
        await pubPool.query(
          "INSERT INTO notifications (id, customer_id, booking_id, type, title, message, is_read) VALUES ($1, $2, $3, 'BOOKING_CONFIRMED', 'Confirmed', 'Your booking is ready', false)",
          [notifId, userId, bookingId],
        )
        await waitForCondition(async () => {
          const r = await subPool.query(
            'SELECT count(*)::int AS c FROM notifications WHERE id = $1',
            [notifId],
          )
          return r.rows[0].c === 1
        })
      })

      await t.test(
        'DB-03: UPDATE replication (booking status, vehicle status, site banner)',
        async () => {
          await pubPool.query("UPDATE bookings SET status = 'CONFIRMED' WHERE id = $1", [bookingId])
          await pubPool.query("UPDATE vehicles SET operation_status = 'RENTED' WHERE id = $1", [
            vehicleId,
          ])
          await pubPool.query("UPDATE nori_site SET site_name = 'NORI Saigon Fleet'")
          await waitForCondition(async () => {
            const b = await subPool.query('SELECT status FROM bookings WHERE id = $1', [bookingId])
            const v = await subPool.query('SELECT operation_status FROM vehicles WHERE id = $1', [
              vehicleId,
            ])
            const s = await subPool.query('SELECT site_name FROM nori_site LIMIT 1')
            return (
              b.rows[0]?.status === 'CONFIRMED' &&
              v.rows[0]?.operation_status === 'RENTED' &&
              s.rows[0]?.site_name === 'NORI Saigon Fleet'
            )
          })
        },
      )

      await t.test('DB-04: DELETE replication', async () => {
        await pubPool.query('DELETE FROM notifications WHERE id = $1', [notifId])
        await waitForCondition(async () => {
          const r = await subPool.query(
            'SELECT count(*)::int AS c FROM notifications WHERE id = $1',
            [notifId],
          )
          return r.rows[0].c === 0
        })
      })

      await t.test('DB-05: TRUNCATE replication', async () => {
        await pubPool.query(
          "INSERT INTO audit_logs (id, action, entity, summary, actor_type) VALUES (gen_random_uuid(), 'LOGIN', 'admins', 'ok', 'SYSTEM')",
        )
        await waitForCondition(async () => {
          const r = await subPool.query('SELECT count(*)::int AS c FROM audit_logs')
          return r.rows[0].c === 1
        })
        await pubPool.query('TRUNCATE TABLE audit_logs CASCADE')
        await waitForCondition(async () => {
          const r = await subPool.query('SELECT count(*)::int AS c FROM audit_logs')
          return r.rows[0].c === 0
        })
      })

      await t.test(
        'DB-06 & DB-17 & DB-18: Full parity, nori_readonly write denial, no reverse pub',
        async () => {
          const parity1 = await compareSourceAndReplicaParity(pubUrl, subReplicaUrl)
          assert.equal(parity1.ok, true, `Parity alerts: ${JSON.stringify(parity1)}`)
          assert.equal(parity1.fkConstraintCountSource, parity1.fkConstraintCountReplica)
          const roCheck = await verifyReadOnlyRoleAccess(subReplicaUrl, 'nori_readonly', 'bookings')
          assert.equal(roCheck.ok, true)
          assert.equal(setupOut.readonlyRole.liveWriteDenialTest.writeBlocked, true)
          const subHealth = await inspectPostgresEndpoint(subReplicaUrl)
          assert.equal(subHealth.publications.length, 0)
        },
      )

      await t.test('DB-07: Disconnect & reconnect WAL catch-up recovery', async () => {
        await subPool.query('ALTER SUBSCRIPTION nori_sub DISABLE')
        const booking2Id = crypto.randomUUID()
        await pubPool.query(
          "INSERT INTO bookings (id, booking_key, customer_id, vehicle_id, start_date, end_date, total_price, status, pickup_branch_id, return_branch_id) VALUES ($1, 'BK-1002', $2, $3, '2026-12-05', '2026-12-06', 1200000, 'PENDING', $4, $4)",
          [booking2Id, userId, vehicleId, branchId],
        )
        await refreshSubscriptionSafe(subReplicaUrl, 'nori_sub', {
          enableFirst: true,
          copyData: false,
        })
        await waitForCondition(async () => {
          const r = await subPool.query('SELECT count(*)::int AS c FROM bookings')
          return r.rows[0].c === 2
        })
      })

      await t.test('DB-08: Subscriber PG restart automatic reconnect & WAL catch-up', async () => {
        await subPool.end()
        stopCluster(subDir, 'fast')
        const booking3Id = crypto.randomUUID()
        await pubPool.query(
          "INSERT INTO bookings (id, booking_key, customer_id, vehicle_id, start_date, end_date, total_price, status, pickup_branch_id, return_branch_id) VALUES ($1, 'BK-1003', $2, $3, '2026-12-08', '2026-12-09', 1200000, 'CONFIRMED', $4, $4)",
          [booking3Id, userId, vehicleId, branchId],
        )
        startCluster(subDir)
        subPool = new pg.Pool({ connectionString: subReplicaUrl })
        await waitForCondition(async () => {
          const r = await subPool.query('SELECT count(*)::int AS c FROM bookings')
          return r.rows[0].c === 3
        })
      })

      await t.test(
        'DB-09 & DB-20: Replication lag/slot inspection & zero secret leaks',
        async () => {
          const pubHealth = await inspectPostgresEndpoint(pubUrl)
          assert.equal(pubHealth.walLevel, 'logical')
          assert.ok(
            pubHealth.replicationSlots.some((s) => s.slotName === 'nori_sub_slot' && s.active),
          )
          assert.ok(pubHealth.activeSenders.length >= 1)
          const pubHealthJson = JSON.stringify(pubHealth)
          assert.ok(!pubHealthJson.includes(process.env.NORI_BACKUP_ENCRYPTION_KEY))
        },
      )

      let validBackup = null
      await t.test(
        'DB-11 & DB-12 & DB-13: Encrypted backup, failure preservation & tamper detection',
        async () => {
          validBackup = await createEncryptedPgBackup({
            sourceUrl: subReplicaUrl,
            outDir: backupOutDir,
            tier: 'daily',
          })
          assert.equal(validBackup.ok, true)
          assert.equal(validBackup.manifest.encrypted, true)
          assert.equal(validBackup.manifest.cipher, 'aes-256-gcm')
          const rawHeader = fs
            .readFileSync(validBackup.archivePath)
            .subarray(0, 8)
            .toString('ascii')
          assert.equal(rawHeader, 'NORIENC1')

          const verifyOk = await verifyEncryptedPgBackup({
            backupDir: validBackup.backupDir,
            outDir: backupOutDir,
          })
          assert.equal(verifyOk.ok, true)
          assert.equal(verifyOk.pgRestoreListOk, true)

          await assert.rejects(() =>
            createEncryptedPgBackup({
              sourceUrl: 'postgresql://postgres@127.0.0.1:59999/nonexistent',
              outDir: backupOutDir,
              tier: 'daily',
            }),
          )
          const verifyStillOk = await verifyEncryptedPgBackup({
            backupDir: validBackup.backupDir,
            outDir: backupOutDir,
          })
          assert.equal(verifyStillOk.ok, true)

          const tamperedDir = path.join(workRoot, 'tampered-bkp')
          fs.cpSync(validBackup.backupDir, tamperedDir, { recursive: true })
          const tamperedArchive = path.join(tamperedDir, validBackup.manifest.archiveFilename)
          const buf = fs.readFileSync(tamperedArchive)
          buf[buf.length - 20] ^= 0xff
          fs.writeFileSync(tamperedArchive, buf)
          const verifyTampered = await verifyEncryptedPgBackup({ backupDir: tamperedDir })
          assert.equal(verifyTampered.ok, false)
        },
      )

      await t.test(
        'DB-15: Isolated pg_restore + automatic setval() serial sequence reset',
        async () => {
          const restoreRes = await restoreEncryptedPgBackup({
            backupDir: validBackup.backupDir,
            targetUrl: subIsolatedRestoreUrl,
          })
          assert.equal(restoreRes.ok, true)
          assert.equal(restoreRes.fkViolations, 0)
          assert.ok(restoreRes.sequencesReset >= 42)

          const isoPool = new pg.Pool({ connectionString: subIsolatedRestoreUrl })
          try {
            await isoPool.query(
              "INSERT INTO bookings_rels (parent_id, path, users_id) VALUES ($1, 'customer_extra', $2)",
              [bookingId, userId],
            )
            const relRows = await isoPool.query('SELECT id FROM bookings_rels ORDER BY id ASC')
            assert.equal(relRows.rows.length, 2)
            assert.ok(relRows.rows[1].id > relRows.rows[0].id)
          } finally {
            await isoPool.end()
          }
        },
      )

      await t.test('DB-10: Invalidated slot detection & safe re-init workflow', async () => {
        const reinitPlan = buildSlotReinitRunbook()
        assert.ok(reinitPlan.some((l) => l.includes('DROP SUBSCRIPTION')))
        await subPool.query('ALTER SUBSCRIPTION nori_sub DISABLE')
        await subPool.query('ALTER SUBSCRIPTION nori_sub SET (slot_name = NONE)')
        await subPool.query('DROP SUBSCRIPTION nori_sub')
        await pubPool.query("SELECT pg_drop_replication_slot('nori_sub_slot')")
        await subPool.query(
          'TRUNCATE TABLE bookings, payments, vehicles, vehicle_models, users, branches, nori_site, payload_migrations CASCADE',
        )
        await subPool.query(
          `CREATE SUBSCRIPTION nori_sub CONNECTION 'host=127.0.0.1 port=${pubPort} dbname=neondb_sim user=postgres' PUBLICATION nori_pub WITH (copy_data = true, create_slot = true, slot_name = 'nori_sub_slot', enabled = true)`,
        )
        await waitForCondition(async () => {
          const b = await subPool.query('SELECT count(*)::int AS c FROM bookings')
          const rel = await subPool.query(
            "SELECT count(*)::int AS pending FROM pg_subscription_rel WHERE srsubstate <> 'r'",
          )
          return b.rows[0].c === 3 && rel.rows[0].pending === 0
        }, 45000)
      })

      await t.test(
        'DB-21: DDL / schema-change drift detection & manual sync recovery',
        async () => {
          await pubPool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS test_ddl_col varchar')
          const driftReport = await compareSourceAndReplicaParity(pubUrl, subReplicaUrl)
          assert.equal(driftReport.ok, false)
          assert.ok(
            driftReport.columnDiffs.some(
              (d) => d.table === 'bookings' && d.missingCols.includes('test_ddl_col'),
            ),
          )
          await subPool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS test_ddl_col varchar')
          await refreshSubscriptionSafe(subReplicaUrl, 'nori_sub', { copyData: false })
          const repairedReport = await compareSourceAndReplicaParity(pubUrl, subReplicaUrl)
          assert.equal(
            repairedReport.ok,
            true,
            `Repaired report: ${JSON.stringify(repairedReport)}`,
          )
        },
      )

      await t.test(
        'DB-22: Offline upstream -> local nori_replica remains readable as nori_readonly',
        async () => {
          await pubPool.end()
          pubPool = null
          stopCluster(pubDir)
          const roClient = new pg.Client({
            connectionString: `postgresql://nori_readonly:ro_test_pass_2026@127.0.0.1:${subPort}/nori_replica`,
          })
          await roClient.connect()
          const roRes = await roClient.query('SELECT count(*)::int AS c FROM bookings')
          assert.equal(roRes.rows[0].c, 3)
          await roClient.end()
        },
      )
    } finally {
      if (prevKey === undefined) delete process.env.NORI_BACKUP_ENCRYPTION_KEY
      else process.env.NORI_BACKUP_ENCRYPTION_KEY = prevKey

      if (subPool) await subPool.end().catch(() => {})
      if (pubPool) await pubPool.end().catch(() => {})
      stopCluster(subDir)
      stopCluster(pubDir)
      fs.rmSync(workRoot, { recursive: true, force: true })
    }
  },
)

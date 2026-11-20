import test from 'node:test'
import assert from 'node:assert/strict'
import { runDatabaseMigration, importSnapshots } from '../src/lib/data-sync.ts'

test('CI-INIT: Initialize SQLite Database & Import Snapshot Data', async () => {
  const migRes = runDatabaseMigration()
  assert.equal(migRes.ok, true, `Database migration failed: integrity=${migRes.integrity}`)
  assert.ok(migRes.tablesCount >= 100, `Expected >= 100 tables, got ${migRes.tablesCount}`)

  const impRes = await importSnapshots({ skipBackup: true, allowProductionImport: true })
  assert.equal(impRes.ok, true, `Snapshot import failed: status=${impRes.status}`)
})

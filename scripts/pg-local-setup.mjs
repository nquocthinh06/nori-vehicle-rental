import pg from 'pg'
import {
  applyPostgresMigrationsDirect,
  assertNotProductionTarget,
  buildPoolForUrl,
  loadDotEnvIfAbsent,
  redactPostgresUrl,
  verifyReadOnlyRoleAccess,
} from '../src/lib/pg-replication.ts'

loadDotEnvIfAbsent()

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const isJson = process.argv.includes('--json')
const skipMigrations = process.argv.includes('--skip-migrations')
const adminUrl =
  parseArg('--admin-url') ||
  process.env.LOCAL_PG_ADMIN_URL ||
  (() => {
    const pass = process.env.LOCAL_PG_PASSWORD || process.env.PGPASSWORD || ''
    const auth = pass ? `postgres:${encodeURIComponent(pass)}@` : 'postgres@'
    const port = process.env.LOCAL_PG_PORT || '5432'
    return `postgresql://${auth}127.0.0.1:${port}/postgres`
  })()

const replicaDbName = parseArg('--replica-db') || process.env.LOCAL_REPLICA_DB || 'nori_replica'
const devDbName = parseArg('--dev-db') || process.env.LOCAL_DEV_DB || 'nori_development'
const readonlyRole = parseArg('--readonly-role') || 'nori_readonly'
const readonlyPass =
  parseArg('--readonly-password') ||
  process.env.LOCAL_PG_READONLY_PASSWORD ||
  'nori_readonly_local_2026'

function replaceDbInUrl(baseUrl, dbName) {
  const u = new URL(baseUrl)
  u.pathname = `/${dbName}`
  return u.toString()
}

async function ensureDatabaseExists(adminPool, dbName) {
  const res = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
  if (res.rowCount === 0) {
    await adminPool.query(`CREATE DATABASE "${dbName}"`)
    return true
  }
  return false
}

async function ensureReadonlyRole(adminPool, roleName, password) {
  const res = await adminPool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [roleName])
  if (res.rowCount === 0) {
    await adminPool.query(
      `CREATE ROLE "${roleName}" WITH LOGIN PASSWORD '${password.replace(/'/g, "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
    )
    return true
  }
  await adminPool.query(
    `ALTER ROLE "${roleName}" WITH LOGIN PASSWORD '${password.replace(/'/g, "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
  )
  return false
}

async function grantReadOnlyPrivileges(dbUrl, dbName, roleName) {
  const pool = buildPoolForUrl(dbUrl, 1)
  try {
    await pool.query(`REVOKE ALL ON DATABASE "${dbName}" FROM PUBLIC`)
    await pool.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${roleName}"`)
    await pool.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`)
    await pool.query(`REVOKE ALL ON SCHEMA public FROM "${roleName}"`)
    await pool.query(`GRANT USAGE ON SCHEMA public TO "${roleName}"`)
    await pool.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "${roleName}"`)
    await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${roleName}"`)
    await pool.query(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO "${roleName}"`)
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "${roleName}"`,
    )
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO "${roleName}"`,
    )
  } finally {
    await pool.end()
  }
}

async function testReadOnlyWriteBlocked(dbUrl, roleName, password) {
  const roUrl = new URL(dbUrl)
  roUrl.username = roleName
  roUrl.password = password
  const client = new pg.Client({ connectionString: roUrl.toString() })
  await client.connect()
  try {
    const sel = await client.query('SELECT count(*)::int AS c FROM bookings')
    let writeBlocked = false
    try {
      await client.query(
        "INSERT INTO audit_logs (action, entity, summary, actor_type) VALUES ('TEST', 'test', 'should fail', 'SYSTEM')",
      )
    } catch {
      writeBlocked = true
    }
    return {
      ok: writeBlocked && Number.isInteger(sel.rows[0]?.c),
      canSelectBookings: true,
      writeBlocked,
    }
  } finally {
    await client.end()
  }
}

async function main() {
  assertNotProductionTarget(adminUrl, 'local PostgreSQL provisioning')

  const adminPool = buildPoolForUrl(adminUrl, 1)
  let replicaCreated = false
  let devCreated = false
  let roleCreated = false

  try {
    replicaCreated = await ensureDatabaseExists(adminPool, replicaDbName)
    devCreated = await ensureDatabaseExists(adminPool, devDbName)
    roleCreated = await ensureReadonlyRole(adminPool, readonlyRole, readonlyPass)
  } finally {
    await adminPool.end()
  }

  const replicaUrl = replaceDbInUrl(adminUrl, replicaDbName)
  const devUrl = replaceDbInUrl(adminUrl, devDbName)

  let replicaMig = { applied: [], skipped: [], totalTables: 0 }
  let devMig = { applied: [], skipped: [], totalTables: 0 }

  if (!skipMigrations) {
    replicaMig = await applyPostgresMigrationsDirect(replicaUrl)
    devMig = await applyPostgresMigrationsDirect(devUrl)
  }

  await grantReadOnlyPrivileges(replicaUrl, replicaDbName, readonlyRole)
  const privCheck = await verifyReadOnlyRoleAccess(replicaUrl, readonlyRole, 'bookings')
  const liveRoTest = await testReadOnlyWriteBlocked(replicaUrl, readonlyRole, readonlyPass)

  const result = {
    ok: privCheck.ok && liveRoTest.ok,
    adminEndpoint: redactPostgresUrl(adminUrl),
    databases: {
      replica: {
        name: replicaDbName,
        created: replicaCreated,
        totalTables: replicaMig.totalTables,
        migrationsApplied: replicaMig.applied,
      },
      development: {
        name: devDbName,
        created: devCreated,
        totalTables: devMig.totalTables,
        migrationsApplied: devMig.applied,
      },
    },
    readonlyRole: {
      name: readonlyRole,
      created: roleCreated,
      privilegeCheck: privCheck,
      liveWriteDenialTest: liveRoTest,
    },
  }

  if (isJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log('='.repeat(70))
    console.log(' NORI LOCAL POSTGRESQL 18 PROVISIONING')
    console.log('='.repeat(70))
    console.log(
      `Replica DB "${replicaDbName}": created=${replicaCreated}, tables=${replicaMig.totalTables}, newMigrations=${replicaMig.applied.length}`,
    )
    console.log(
      `Dev DB "${devDbName}":     created=${devCreated}, tables=${devMig.totalTables}, newMigrations=${devMig.applied.length}`,
    )
    console.log(
      `ReadOnly "${readonlyRole}": created=${roleCreated}, selectOK=${privCheck.canSelect}, writeBlocked=${liveRoTest.writeBlocked}`,
    )
  }

  if (!result.ok) process.exit(1)
}

main().catch((err) => {
  console.error('[PG-LOCAL-SETUP] Error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})

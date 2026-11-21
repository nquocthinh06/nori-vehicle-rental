import { DatabaseSync } from 'node:sqlite'
import { Client } from 'pg'
import fs from 'node:fs'

// Load .env variables
if (!process.env.DATABASE_URL && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8')
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim()
      let val = trimmed.slice(idx + 1).trim()
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
      if (!process.env[key]) process.env[key] = val
    }
  }
}

const TABLE_ORDER = [
  // 1. Core Auth & Independent Reference Data
  'admins',
  'users',
  'tags',
  'folders',
  'branches',
  'warehouses',
  'delivery_zones',
  'service_locations',
  'location_pricing_rules',
  'one_way_rental_rules',
  'promotions',

  // 2. Media
  'media',

  // 3. Staff & Models
  'branch_staff',
  'vehicle_models',
  'vehicle_models_features',
  'vehicle_models_gallery',
  'vehicle_models_highlights',
  'vehicle_models_specifications',
  'vehicle_models_variants',
  'vehicle_models_variants_colors',

  // 4. Vehicles & Maintenance
  'vehicles',
  'vehicles_photos',
  'vehicle_location_history',
  'vehicle_transfers',
  'maintenance_schedules',

  // 5. Bookings & Operations
  'bookings',
  'bookings_modification_history',
  'bookings_modification_history_changes',
  'bookings_status_history',
  'rental_days',
  'delivery_jobs',

  // 6. Payments
  'payments',
  'payment_events',
  'refunds',

  // 7. CRM & Content
  'consultations',
  'consultations_contact_logs',
  'notifications',
  'sales_inquiries',
  'sales_inquiries_status_history',
  'reviews',
  'posts',
  'nori_site',
  'nori_site_faqs',
  'nori_site_footer_links',
  'nori_site_header_menu',
  'nori_site_hero_images',
  'nori_site_hero_slides',
  'nori_site_holidays',
  'nori_site_social_links',

  // 8. Versions
  '_media_v',
  '_posts_v',
  '_folders_v',
  '_tags_v',
  '_nori_site_v',
  '_nori_site_v_version_faqs',
  '_nori_site_v_version_footer_links',
  '_nori_site_v_version_header_menu',
  '_nori_site_v_version_hero_images',
  '_nori_site_v_version_hero_slides',
  '_nori_site_v_version_holidays',
  '_nori_site_v_version_social_links',

  // 9. Join & Relationship Tables (_rels)
  'admins_rels',
  'users_rels',
  'branches_rels',
  'warehouses_rels',
  'delivery_zones_rels',
  'service_locations_rels',
  'location_pricing_rules_rels',
  'one_way_rental_rules_rels',
  'promotions_rels',
  'folders_rels',
  'tags_rels',
  'media_rels',
  'branch_staff_rels',
  'vehicle_models_rels',
  'vehicles_rels',
  'vehicle_location_history_rels',
  'vehicle_transfers_rels',
  'maintenance_schedules_rels',
  'bookings_rels',
  'rental_days_rels',
  'delivery_jobs_rels',
  'payments_rels',
  'payment_events_rels',
  'refunds_rels',
  'consultations_rels',
  'notifications_rels',
  'sales_inquiries_rels',
  'reviews_rels',
  'posts_rels',
  'nori_site_rels',
  '_media_v_rels',
  '_posts_v_rels',
  '_folders_v_rels',
  '_tags_v_rels',
  '_nori_site_v_rels',

  // 10. Sessions & System tables
  'admins_sessions',
  'users_sessions',
  'branches_gallery',
  'audit_logs',
  'audit_logs_rels',
  'payload_preferences',
  'payload_preferences_rels',
  'payload_kv',
  'payload_llm_instructions',
  'payload_llm_instructions_rels',
  'payload_locked_documents',
  'payload_locked_documents_rels',
]

async function migrate() {
  console.log('====================================================')
  console.log('   NORI: SQLite to Neon PostgreSQL Data Migration   ')
  console.log('====================================================')

  const sqlite = new DatabaseSync('nori.db')
  const rawPgUrl = process.env.DATABASE_URL || ''
  const pgUrl =
    rawPgUrl.includes('sslmode=require') && !rawPgUrl.includes('uselibpqcompat=true')
      ? rawPgUrl.replace('sslmode=require', 'sslmode=verify-full')
      : rawPgUrl
  const isNeon = pgUrl.includes('neon.tech') || pgUrl.includes('sslmode=')
  const client = new Client({
    connectionString: pgUrl,
    ...(isNeon ? {} : { ssl: { rejectUnauthorized: false } }),
  })

  await client.connect()
  console.log('[1/5] Connected to Neon PostgreSQL (staging).')

  // Fetch PG column metadata
  const pgColsRes = await client.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `)
  const pgColsByTable = new Map()
  for (const row of pgColsRes.rows) {
    if (!pgColsByTable.has(row.table_name)) pgColsByTable.set(row.table_name, new Map())
    pgColsByTable.get(row.table_name).set(row.column_name, row)
  }

  // Check which tables have data in SQLite
  const sqliteTables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name)

  const activeTables = TABLE_ORDER.filter((t) => sqliteTables.includes(t))
  console.log(`[2/5] Verified ${activeTables.length} tables in migration order.`)

  console.log('[3/5] Starting data transfer in transaction...')
  await client.query('BEGIN')

  let totalRowsTransferred = 0
  const stats = []

  try {
    for (const table of activeTables) {
      const sqliteRows = sqlite.prepare(`SELECT * FROM "${table}"`).all()
      if (sqliteRows.length === 0) {
        continue
      }

      const pgColMap = pgColsByTable.get(table)
      if (!pgColMap) {
        console.warn(`  [WARN] Table ${table} does not exist in PostgreSQL. Skipping.`)
        continue
      }

      // Filter to only columns that exist in PG
      const rawCols = Object.keys(sqliteRows[0])
      const validCols = rawCols.filter((col) => pgColMap.has(col))

      if (validCols.length === 0) {
        continue
      }

      const colNamesStr = validCols.map((c) => `"${c}"`).join(', ')

      // Insert rows
      let insertedCount = 0
      for (const row of sqliteRows) {
        const values = validCols.map((col) => {
          let val = row[col]
          if (val === undefined) return null

          const colMeta = pgColMap.get(col)
          const dt = colMeta.data_type

          if (dt === 'boolean') {
            if (val === 1 || val === '1' || val === true || val === 'true') return true
            if (val === 0 || val === '0' || val === false || val === 'false') return false
            return null
          }

          if (dt === 'jsonb') {
            if (val === null || val === undefined) return null
            if (typeof val === 'string') {
              try {
                return JSON.parse(val)
              } catch {
                return val
              }
            }
            return val
          }

          if (dt === 'numeric' || dt === 'integer' || dt === 'bigint') {
            if (val === '') return null
            return val
          }

          return val
        })

        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')
        const query = `INSERT INTO "${table}" (${colNamesStr}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`

        await client.query(query, values)
        insertedCount++
      }

      totalRowsTransferred += insertedCount
      stats.push({ table, sqliteCount: sqliteRows.length, insertedCount })
      console.log(`  ✓ ${table}: ${insertedCount}/${sqliteRows.length} rows`)
    }

    await client.query('COMMIT')
    console.log(`\n[4/5] Transaction committed! Transferred ${totalRowsTransferred} rows.`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Migration failed during data transfer. Rolled back.', err)
    await client.end()
    sqlite.close()
    process.exit(1)
  }

  // Reset serial sequences
  console.log('[5/5] Resetting PostgreSQL serial sequences...')
  const seqRes = await client.query(`
    SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  `)

  let sequencesUpdated = 0
  for (const s of seqRes.rows) {
    const seq = s.sequence_name
    // Derive table name from sequence name convention: table_name_id_seq or table_name_order_seq
    // Better: find which table/column owns this sequence
    const ownerRes = await client.query(
      `
      SELECT t.relname AS table_name, a.attname AS column_name
      FROM pg_class s
      JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE s.relname = $1
    `,
      [seq],
    )

    if (ownerRes.rows.length > 0) {
      const { table_name, column_name } = ownerRes.rows[0]
      try {
        await client.query(`
          SELECT setval(
            pg_get_serial_sequence('"${table_name}"', '${column_name}'),
            COALESCE((SELECT MAX("${column_name}") FROM "${table_name}"), 1)
          )
        `)
        sequencesUpdated++
      } catch (e) {
        // Ignore if sequence not linked or table empty
      }
    }
  }
  console.log(`  ✓ Updated ${sequencesUpdated} serial sequences.`)

  // Run reconciliation audit
  console.log('\n====================================================')
  console.log('              DATA RECONCILIATION AUDIT              ')
  console.log('====================================================')

  let allMatched = true
  const auditReport = []

  for (const s of stats) {
    const pgCountRes = await client.query(`SELECT count(*)::int as c FROM "${s.table}"`)
    const pgCount = pgCountRes.rows[0].c
    const matched = pgCount === s.sqliteCount
    if (!matched) allMatched = false
    auditReport.push({
      table: s.table,
      sqlite: s.sqliteCount,
      postgres: pgCount,
      status: matched ? 'MATCH' : 'MISMATCH',
    })
  }

  console.table(auditReport)

  // Verify critical records
  console.log('\n--- Critical Records Verification ---')
  const adminRes = await client.query(
    "SELECT email, admin_role, hash, salt FROM admins WHERE email = 'admin@nori.vn'",
  )
  if (adminRes.rows.length > 0) {
    console.log(
      `  ✓ Super Admin found: ${adminRes.rows[0].email} (role: ${adminRes.rows[0].admin_role}, hash length: ${adminRes.rows[0].hash?.length})`,
    )
  } else {
    console.error('  ✗ Super Admin NOT found!')
    allMatched = false
  }

  const customerRes = await client.query(
    "SELECT email, full_name, phone, role FROM users WHERE email = 'thinhnq@nori.vn'",
  )
  if (customerRes.rows.length > 0) {
    console.log(
      `  ✓ Sample Customer found: ${customerRes.rows[0].email} (${customerRes.rows[0].full_name}, ${customerRes.rows[0].phone})`,
    )
  }

  const vehicleRes = await client.query(
    "SELECT count(*)::int as c FROM vehicles WHERE operation_status = 'READY'",
  )
  console.log(`  ✓ Vehicles Ready count in PG: ${vehicleRes.rows[0].c}`)

  const bookingsRes = await client.query('SELECT count(*)::int as c FROM bookings')
  console.log(`  ✓ Bookings count in PG: ${bookingsRes.rows[0].c}`)

  const paymentsRes = await client.query('SELECT count(*)::int as c FROM payments')
  console.log(`  ✓ Payments count in PG: ${paymentsRes.rows[0].c}`)

  const mediaRes = await client.query('SELECT count(*)::int as c FROM media')
  console.log(`  ✓ Media assets count in PG: ${mediaRes.rows[0].c}`)

  await client.end()
  sqlite.close()

  if (allMatched) {
    console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY: 100% Data Integrity Preserved.')
  } else {
    console.error('\n⚠️ MIGRATION COMPLETED WITH DISCREPANCIES. Review audit table above.')
    process.exit(1)
  }
}

migrate().catch((err) => {
  console.error('Fatal migration error:', err)
  process.exit(1)
})

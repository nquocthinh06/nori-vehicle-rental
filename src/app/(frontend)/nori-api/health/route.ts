import { NextResponse } from 'next/server'
import { getPayloadClient } from '@/lib/payload'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payload = await getPayloadClient()
    const [vehiclesCheck, bookingsCheck] = await Promise.all([
      payload.count({ collection: 'vehicles', overrideAccess: true }),
      payload.find({ collection: 'bookings', overrideAccess: true, depth: 0, limit: 1 }),
    ])
    return NextResponse.json(
      {
        status: 'ok',
        db: 'connected',
        readiness: 'READY',
        vehiclesCount: vehiclesCheck.totalDocs,
        bookingsCount: bookingsCheck.totalDocs,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        status: 'error',
        db: 'unhealthy',
        readiness: 'NOT_READY',
        reason: errorMsg.includes('no such column')
          ? 'SCHEMA_MISMATCH_MISSING_COLUMN'
          : errorMsg.includes('no such table')
            ? 'SCHEMA_MISMATCH_MISSING_TABLE'
            : 'DB_QUERY_FAILED',
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  }
}

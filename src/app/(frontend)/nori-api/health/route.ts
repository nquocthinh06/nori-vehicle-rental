import { NextResponse } from 'next/server'
import fs from 'node:fs'
import { createRequestLogger } from '@/lib/api-utils'
import { getCloudStorageConfig, isCloudStorageConfigured } from '@/lib/cloud-storage'
import { getEnvConfigSummary, resolveMediaDir } from '@/lib/env'
import { getPayloadClient } from '@/lib/payload'

export const dynamic = 'force-dynamic'

async function countAppliedPgMigrations(payload: Awaited<ReturnType<typeof getPayloadClient>>) {
  try {
    const dbAdapter = payload.db as unknown as {
      drizzle?: { execute?: (stmt: unknown) => Promise<{ rows?: Array<{ applied?: number }> }> }
    }
    if (!dbAdapter?.drizzle?.execute) return null
    const { sql } = await import('@payloadcms/db-postgres')
    const res = await dbAdapter.drizzle.execute(
      sql`SELECT count(*)::int AS applied FROM payload_migrations WHERE batch >= 0`,
    )
    const count = res?.rows?.[0]?.applied
    return typeof count === 'number' ? count : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const logger = createRequestLogger('nori-api/health', request)
  const url = new URL(request.url)
  const checkType = url.searchParams.get('type')
  const envSummary = getEnvConfigSummary()

  // Fast liveness probe for reverse proxies, process managers, and uptime monitors
  if (checkType === 'live') {
    logger.logSuccess(200, { type: 'live' })
    return NextResponse.json(
      {
        status: 'ok',
        liveness: 'ALIVE',
        runtimeTier: envSummary.tier,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store', ...logger.responseHeaders() },
      },
    )
  }

  // Deep readiness probe
  // Determine if caller is authorized to view sensitive internal diagnostic metrics
  const authHeader = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim()
  const healthToken = request.headers.get('x-health-token')?.trim()
  const payloadSecret = process.env.PAYLOAD_SECRET?.trim()
  const isAuthorizedSecret = Boolean(
    payloadSecret && (authHeader === payloadSecret || healthToken === payloadSecret),
  )

  const hostHeader = request.headers.get('host') || ''
  const isLoopback =
    hostHeader.includes('localhost') ||
    hostHeader.includes('127.0.0.1') ||
    hostHeader.includes('[::1]')

  const isDiagnosticAuthorized = isAuthorizedSecret || isLoopback

  try {
    const payload = await logger.time('payload', () => getPayloadClient())
    const dbStart = performance.now()
    const [vehiclesCheck, bookingsCheck, appliedMigrationsCount] = await logger.time(
      'db_probe',
      () =>
        Promise.all([
          payload.count({ collection: 'vehicles', overrideAccess: true }),
          payload.find({ collection: 'bookings', overrideAccess: true, depth: 0, limit: 1 }),
          isDiagnosticAuthorized && envSummary.databaseEngine === 'postgres'
            ? countAppliedPgMigrations(payload)
            : Promise.resolve(null),
        ]),
    )
    const dbLatencyMs = Math.round((performance.now() - dbStart) * 10) / 10

    // Check media storage availability (cloud storage on serverless vs writable local disk)
    const cloudConfig = getCloudStorageConfig()
    let mediaStatus = 'accessible'
    if (isCloudStorageConfigured() && cloudConfig) {
      mediaStatus = `cloud:${cloudConfig.provider.toLowerCase()}`
    } else if (process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV)) {
      mediaStatus = 'degraded'
    } else {
      const mediaDir = resolveMediaDir()
      try {
        if (!fs.existsSync(mediaDir)) {
          fs.mkdirSync(mediaDir, { recursive: true })
        }
        fs.accessSync(mediaDir, fs.constants.R_OK | fs.constants.W_OK)
      } catch {
        mediaStatus = 'degraded'
      }
    }
    const isMediaReady = mediaStatus !== 'degraded'

    const mem = process.memoryUsage()
    const memUsageMb = {
      rss: Math.round(mem.rss / (1024 * 1024)),
      heapUsed: Math.round(mem.heapUsed / (1024 * 1024)),
    }

    logger.logSuccess(200, { dbLatencyMs, mediaReady: isMediaReady })

    // If authorized (loopback or secret token), return full diagnostic details
    if (isDiagnosticAuthorized) {
      return NextResponse.json(
        {
          status: 'ok',
          db: 'connected',
          dbLatencyMs,
          databaseEngine: envSummary.databaseEngine,
          runtimeTier: envSummary.tier,
          mediaStorage: mediaStatus,
          readiness: isMediaReady ? 'READY' : 'DEGRADED_STORAGE',
          vehiclesCount: vehiclesCheck.totalDocs,
          bookingsCount: bookingsCheck.totalDocs,
          ...(appliedMigrationsCount !== null ? { appliedMigrationsCount } : {}),
          memoryMb: memUsageMb,
          uptimeSeconds: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
        },
        {
          status: 200,
          headers: { 'Cache-Control': 'private, no-store', ...logger.responseHeaders() },
        },
      )
    }

    // For public/unauthenticated callers, return sanitized readiness status without internal metrics
    return NextResponse.json(
      {
        status: 'ok',
        db: 'connected',
        dbLatencyMs,
        readiness: isMediaReady ? 'READY' : 'DEGRADED_STORAGE',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store', ...logger.responseHeaders() },
      },
    )
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.logError('HEALTHCHECK_FAILED', 503, errorMsg.slice(0, 120))

    if (isDiagnosticAuthorized) {
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
          headers: { 'Cache-Control': 'private, no-store', ...logger.responseHeaders() },
        },
      )
    }

    // Sanitized error response for public callers
    return NextResponse.json(
      {
        status: 'error',
        db: 'unhealthy',
        readiness: 'NOT_READY',
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store', ...logger.responseHeaders() },
      },
    )
  }
}

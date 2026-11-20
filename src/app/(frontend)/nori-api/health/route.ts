import { NextResponse } from 'next/server'
import fs from 'node:fs'
import { getPayloadClient } from '@/lib/payload'
import { resolveMediaDir } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const checkType = url.searchParams.get('type')

  // Fast liveness probe for reverse proxies, process managers, and uptime monitors
  if (checkType === 'live') {
    return NextResponse.json(
      {
        status: 'ok',
        liveness: 'ALIVE',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  }

  // Deep readiness probe
  // Determine if caller is authorized to view sensitive internal diagnostic metrics
  const authHeader = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const healthToken = request.headers.get('x-health-token')?.trim()
  const payloadSecret = process.env.PAYLOAD_SECRET?.trim()
  const isAuthorizedSecret = Boolean(payloadSecret && (authHeader === payloadSecret || healthToken === payloadSecret))

  const hostHeader = request.headers.get('host') || ''
  const isLoopback =
    hostHeader.includes('localhost') ||
    hostHeader.includes('127.0.0.1') ||
    hostHeader.includes('[::1]')

  const isDiagnosticAuthorized = isAuthorizedSecret || isLoopback

  try {
    const payload = await getPayloadClient()
    const [vehiclesCheck, bookingsCheck] = await Promise.all([
      payload.count({ collection: 'vehicles', overrideAccess: true }),
      payload.find({ collection: 'bookings', overrideAccess: true, depth: 0, limit: 1 }),
    ])

    // Check media storage availability
    const mediaDir = resolveMediaDir()
    let mediaStatus = 'accessible'
    try {
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true })
      }
      fs.accessSync(mediaDir, fs.constants.R_OK | fs.constants.W_OK)
    } catch {
      mediaStatus = 'degraded'
    }

    const mem = process.memoryUsage()
    const memUsageMb = {
      rss: Math.round(mem.rss / (1024 * 1024)),
      heapUsed: Math.round(mem.heapUsed / (1024 * 1024)),
    }

    // If authorized (loopback or secret token), return full diagnostic details
    if (isDiagnosticAuthorized) {
      return NextResponse.json(
        {
          status: 'ok',
          db: 'connected',
          mediaStorage: mediaStatus,
          readiness: mediaStatus === 'accessible' ? 'READY' : 'DEGRADED_STORAGE',
          vehiclesCount: vehiclesCheck.totalDocs,
          bookingsCount: bookingsCheck.totalDocs,
          memoryMb: memUsageMb,
          uptimeSeconds: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
        },
        {
          status: 200,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      )
    }

    // For public/unauthenticated callers, return sanitized readiness status without internal metrics
    return NextResponse.json(
      {
        status: 'ok',
        db: 'connected',
        readiness: mediaStatus === 'accessible' ? 'READY' : 'DEGRADED_STORAGE',
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
          headers: { 'Cache-Control': 'private, no-store' },
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
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  }
}

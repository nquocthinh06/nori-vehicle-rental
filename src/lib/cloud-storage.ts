import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import fs from 'node:fs/promises'
import path from 'node:path'

export interface CloudStorageConfig {
  bucket: string
  endpoint?: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  publicDomain?: string
  prefix: string
}

export interface CloudSyncResult {
  filename: string
  sizeBytes: number
  status: 'UPLOADED' | 'ALREADY_EXISTS' | 'FAILED'
  error?: string
}

export interface CloudSyncReport {
  totalChecked: number
  uploaded: number
  alreadyExisted: number
  failed: number
  results: CloudSyncResult[]
}

let s3ClientInstance: S3Client | null = null

export function getCloudStorageConfig(): CloudStorageConfig | null {
  const bucket = (process.env.S3_BUCKET || process.env.NORI_S3_BUCKET || '').trim()
  const accessKeyId = (process.env.S3_ACCESS_KEY_ID || process.env.NORI_S3_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = (
    process.env.S3_SECRET_ACCESS_KEY || process.env.NORI_S3_SECRET_ACCESS_KEY || ''
  ).trim()

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null
  }

  const endpoint = (
    process.env.S3_ENDPOINT ||
    process.env.NORI_S3_ENDPOINT ||
    process.env.R2_ENDPOINT ||
    ''
  ).trim()
  const region = (process.env.S3_REGION || process.env.NORI_S3_REGION || 'auto').trim()
  const publicDomain = (
    process.env.S3_PUBLIC_DOMAIN ||
    process.env.NEXT_PUBLIC_S3_HOSTNAME ||
    process.env.NORI_S3_PUBLIC_DOMAIN ||
    ''
  ).trim()
  const prefix = (process.env.S3_PREFIX || process.env.NORI_S3_PREFIX || 'media/').trim()

  return {
    bucket,
    endpoint: endpoint || undefined,
    region: region || 'auto',
    accessKeyId,
    secretAccessKey,
    publicDomain: publicDomain ? publicDomain.replace(/\/+$/, '') : undefined,
    prefix: prefix.endsWith('/') ? prefix : `${prefix}/`,
  }
}

export function isCloudStorageConfigured(): boolean {
  return getCloudStorageConfig() !== null
}

export function getCloudStorageClient(): S3Client | null {
  const config = getCloudStorageConfig()
  if (!config) return null

  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: Boolean(config.endpoint),
    })
  }

  return s3ClientInstance
}

export function getObjectKey(filename: string, prefix?: string): string {
  const cleanFilename = path.basename(filename)
  const p = prefix ?? getCloudStorageConfig()?.prefix ?? 'media/'
  return `${p}${cleanFilename}`
}

export async function checkFileExistsInCloud(filename: string): Promise<boolean> {
  const client = getCloudStorageClient()
  const config = getCloudStorageConfig()
  if (!client || !config) return false

  const key = getObjectKey(filename, config.prefix)
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    )
    return true
  } catch {
    return false
  }
}

export async function uploadToCloudStorage(
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const client = getCloudStorageClient()
  const config = getCloudStorageConfig()
  if (!client || !config) {
    return { success: false, error: 'Cloud storage is not configured' }
  }

  const key = getObjectKey(filename, config.prefix)
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          originalName: filename,
          uploadedAt: new Date().toISOString(),
        },
      }),
    )

    let url: string | undefined
    if (config.publicDomain) {
      url = `${config.publicDomain}/${key}`
    }

    return { success: true, url }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function getFromCloudStorage(filename: string): Promise<Buffer | null> {
  const client = getCloudStorageClient()
  const config = getCloudStorageConfig()
  if (!client || !config) return null

  const key = getObjectKey(filename, config.prefix)
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    )

    if (!response.Body) return null
    const byteArray = await response.Body.transformToByteArray()
    return Buffer.from(byteArray)
  } catch {
    return null
  }
}

export function getCloudPublicUrl(filename: string): string | null {
  const config = getCloudStorageConfig()
  if (!config || !config.publicDomain) return null
  const key = getObjectKey(filename, config.prefix)
  return `${config.publicDomain}/${key}`
}
